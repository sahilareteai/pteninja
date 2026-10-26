import Foundation
import Capacitor
import StoreKit

@objc(AppleStoreKitPlugin)
public class AppleStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleStoreKitPlugin"
    public let jsName = "AppleStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryProductDetails", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise)
    ]

    private var updateListenerTask: Task<Void, Never>? = nil

    @objc override public func load() {
        super.load()
        listenForTransactionUpdates()
    }

    deinit {
        updateListenerTask?.cancel()
    }

    /// Background listener for transactions that occur outside the app or finish asynchronously (e.g. Ask to Buy)
    private func listenForTransactionUpdates() {
        updateListenerTask = Task.detached {
            for await result in Transaction.updates {
                do {
                    let transaction = try self.checkVerified(result)
                    await transaction.finish()
                    CAPLog.print("AppleStoreKit: Processed transaction update for \(transaction.productID)")
                } catch {
                    CAPLog.print("AppleStoreKit: Transaction update unverified: \(error)")
                }
            }
        }
    }

    /// Validates StoreKit 2 cryptographic verification result
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let safe):
            return safe
        }
    }

    /// Purchases an auto-renewable subscription or in-app product by product ID
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId")?.trimmingCharacters(in: .whitespacesAndNewlines), !productId.isEmpty else {
            call.reject("productId is required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Product not found in App Store for ID: \(productId)")
                    return
                }

                let result = try await product.purchase()

                switch result {
                case .success(let verification):
                    let transaction = try self.checkVerified(verification)
                    // Always finish the transaction once safely verified
                    await transaction.finish()

                    var ret: [String: Any] = [
                        "success": true,
                        "orderId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                        "purchaseToken": transaction.jwsRepresentation,
                        "productId": transaction.productID,
                        "purchaseTime": Int(transaction.purchaseDate.timeIntervalSince1970 * 1000)
                    ]
                    if let expirationDate = transaction.expirationDate {
                        ret["expirationTime"] = Int(expirationDate.timeIntervalSince1970 * 1000)
                    }
                    call.resolve(ret)

                case .userCancelled:
                    call.resolve(["canceled": true])

                case .pending:
                    call.resolve(["pending": true])

                @unknown default:
                    call.reject("Unknown purchase state encountered")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    /// Queries localized pricing and details for product IDs from the App Store
    @objc func queryProductDetails(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds") as? [String], !productIds.isEmpty else {
            call.reject("productIds array is required")
            return
        }

        Task {
            do {
                let products = try await Product.products(for: Set(productIds))
                var result: [[String: Any]] = []

                for product in products {
                    var item: [String: Any] = [
                        "productId": product.id,
                        "title": product.displayName,
                        "description": product.description,
                        "formattedPrice": product.displayPrice,
                        "price": NSDecimalNumber(decimal: product.price).doubleValue
                    ]
                    if let subscription = product.subscription {
                        item["billingPeriodUnit"] = "\(subscription.subscriptionPeriod.unit)"
                        item["billingPeriodValue"] = subscription.subscriptionPeriod.value
                        if let intro = subscription.introductoryOffer {
                            item["introductoryPrice"] = intro.displayPrice
                            item["hasIntroductoryOffer"] = true
                        }
                    }
                    result.append(item)
                }

                call.resolve(["products": result])
            } catch {
                call.reject("Failed to query products: \(error.localizedDescription)")
            }
        }
    }

    /// Restores past purchases and current entitlements
    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                // Synchronize with App Store servers
                try await AppStore.sync()

                var activePurchases: [[String: Any]] = []

                for await result in Transaction.currentEntitlements {
                    do {
                        let transaction = try self.checkVerified(result)
                        var item: [String: Any] = [
                            "orderId": String(transaction.id),
                            "originalTransactionId": String(transaction.originalID),
                            "purchaseToken": transaction.jwsRepresentation,
                            "productId": transaction.productID,
                            "purchaseTime": Int(transaction.purchaseDate.timeIntervalSince1970 * 1000)
                        ]
                        if let expirationDate = transaction.expirationDate {
                            item["expirationTime"] = Int(expirationDate.timeIntervalSince1970 * 1000)
                            // Skip expired subscriptions
                            if expirationDate < Date() {
                                continue
                            }
                        }
                        activePurchases.append(item)
                    } catch {
                        CAPLog.print("AppleStoreKit: Skipping unverified entitlement: \(error)")
                    }
                }

                call.resolve(["purchases": activePurchases])
            } catch {
                call.reject("Failed to restore purchases: \(error.localizedDescription)")
            }
        }
    }
}
