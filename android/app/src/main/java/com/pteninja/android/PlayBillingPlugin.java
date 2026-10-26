package com.pteninja.android;

import android.util.Log;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String TAG = "PlayBillingPlugin";
    private BillingClient billingClient;
    private PluginCall activePurchaseCall;

    @Override
    public void load() {
        super.load();
        initBillingClient();
    }

    private synchronized void initBillingClient() {
        if (billingClient == null) {
            PendingPurchasesParams pendingParams = PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .build();

            billingClient = BillingClient.newBuilder(getContext())
                    .setListener(this)
                    .enablePendingPurchases(pendingParams)
                    .build();
        }
    }

    private void ensureConnected(final Runnable onConnected, final Runnable onError) {
        initBillingClient();
        if (billingClient.isReady()) {
            onConnected.run();
            return;
        }

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK) {
                    onConnected.run();
                } else {
                    Log.e(TAG, "Billing connection failed: " + billingResult.getDebugMessage());
                    if (onError != null) onError.run();
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                Log.w(TAG, "Billing service disconnected, will reconnect on next call");
            }
        });
    }

    @PluginMethod
    public void purchase(final PluginCall call) {
        final String productId = call.getString("productId");
        final String basePlanId = call.getString("basePlanId");
        final String offerId = call.getString("offerId");
        final String promoCode = call.getString("promoCode");
        final Boolean hasPromoBool = call.getBoolean("hasPromo", false);
        final boolean hasPromo = Boolean.TRUE.equals(hasPromoBool) || (promoCode != null && !promoCode.trim().isEmpty());

        if (productId == null || productId.trim().isEmpty()) {
            call.reject("productId is required");
            return;
        }

        ensureConnected(() -> {
            List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
            productList.add(
                    QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(productId.trim())
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()
            );

            QueryProductDetailsParams queryParams = QueryProductDetailsParams.newBuilder()
                    .setProductList(productList)
                    .build();

            billingClient.queryProductDetailsAsync(queryParams, (billingResult, productDetailsResult) -> {
                List<ProductDetails> productDetailsList = productDetailsResult != null ? productDetailsResult.getProductDetailsList() : null;
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK || productDetailsList == null || productDetailsList.isEmpty()) {
                    call.reject("Product not found on Play Console: " + productId + " (" + billingResult.getDebugMessage() + ")");
                    return;
                }

                ProductDetails details = productDetailsList.get(0);
                List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                if (offers == null || offers.isEmpty()) {
                    call.reject("No active base plan or offer found for " + productId + ". Ensure base plan is active on Play Console.");
                    return;
                }

                ProductDetails.SubscriptionOfferDetails selectedOffer = null;
                ProductDetails.SubscriptionOfferDetails basePlanOffer = null;
                ProductDetails.SubscriptionOfferDetails matchingPromoOffer = null;
                ProductDetails.SubscriptionOfferDetails cheapestOffer = null;
                long lowestPriceMicros = Long.MAX_VALUE;

                for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                    boolean baseMatches = (basePlanId == null || basePlanId.trim().isEmpty() || basePlanId.trim().equalsIgnoreCase(offer.getBasePlanId()));
                    if (!baseMatches) continue;

                    List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                    if (!phases.isEmpty()) {
                        long priceMicros = phases.get(0).getPriceAmountMicros();
                        if (priceMicros < lowestPriceMicros) {
                            lowestPriceMicros = priceMicros;
                            cheapestOffer = offer;
                        }
                    }

                    // Track standard base plan offer (no promotional offerId)
                    if (offer.getOfferId() == null || offer.getOfferId().trim().isEmpty()) {
                        if (basePlanOffer == null) {
                            basePlanOffer = offer;
                        }
                    }

                    // Check if offerId, promoCode, or offer tags match Diwali / promo
                    boolean matchesOfferId = (offerId != null && !offerId.trim().isEmpty() && offer.getOfferId() != null
                            && (offer.getOfferId().equalsIgnoreCase(offerId) || offer.getOfferId().toLowerCase().contains(offerId.toLowerCase())));

                    boolean matchesPromoCode = (promoCode != null && !promoCode.trim().isEmpty() && offer.getOfferId() != null
                            && (offer.getOfferId().equalsIgnoreCase(promoCode) || offer.getOfferId().toLowerCase().contains(promoCode.toLowerCase())));

                    boolean matchesTags = false;
                    List<String> tags = offer.getOfferTags();
                    if (tags != null) {
                        for (String tag : tags) {
                            if (tag == null) continue;
                            String t = tag.trim().toLowerCase();
                            if (offerId != null && tag.equalsIgnoreCase(offerId)) matchesTags = true;
                            if (promoCode != null && tag.equalsIgnoreCase(promoCode)) matchesTags = true;
                            if (hasPromo && (t.contains("diwali") || t.contains("diwali20") || t.contains("promo") || t.contains("discount") || t.contains("sale"))) {
                                matchesTags = true;
                            }
                        }
                    }

                    if (offer.getOfferId() != null) {
                        String offIdLower = offer.getOfferId().toLowerCase();
                        if (hasPromo && (offIdLower.contains("diwali") || offIdLower.contains("diwali20") || offIdLower.contains("promo") || offIdLower.contains("discount") || offIdLower.contains("sale"))) {
                            matchesTags = true;
                        }
                    }

                    if (matchesOfferId || matchesPromoCode || matchesTags) {
                        matchingPromoOffer = offer;
                    }
                }

                if (hasPromo) {
                    // With a promo active (e.g. Diwali 20%), prioritize matching promo offer, then cheapest available offer (e.g. ₹600 vs ₹750)
                    if (matchingPromoOffer != null) {
                        selectedOffer = matchingPromoOffer;
                    } else if (cheapestOffer != null) {
                        selectedOffer = cheapestOffer;
                    } else {
                        selectedOffer = basePlanOffer != null ? basePlanOffer : offers.get(0);
                    }
                } else {
                    // No promo active: prefer standard base plan offer unless a specific offerId was explicitly requested
                    if (offerId != null && matchingPromoOffer != null) {
                        selectedOffer = matchingPromoOffer;
                    } else {
                        selectedOffer = basePlanOffer != null ? basePlanOffer : (cheapestOffer != null ? cheapestOffer : offers.get(0));
                    }
                }

                String offerToken = selectedOffer.getOfferToken();
                Log.d(TAG, "Initiating purchase for product: " + productId 
                        + ", basePlan: " + selectedOffer.getBasePlanId() 
                        + ", offerId: " + selectedOffer.getOfferId() 
                        + ", hasPromo: " + hasPromo
                        + ", token: " + offerToken);

                List<BillingFlowParams.ProductDetailsParams> detailsParamsList = new ArrayList<>();
                detailsParamsList.add(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(details)
                                .setOfferToken(offerToken)
                                .build()
                );

                BillingFlowParams flowParams = BillingFlowParams.newBuilder()
                        .setProductDetailsParamsList(detailsParamsList)
                        .build();

                activePurchaseCall = call;

                getActivity().runOnUiThread(() -> {
                    BillingResult launchResult = billingClient.launchBillingFlow(getActivity(), flowParams);
                    if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        activePurchaseCall = null;
                        call.reject("Failed to launch billing flow: " + launchResult.getDebugMessage());
                    }
                });
            });
        }, () -> call.reject("Could not connect to Google Play Billing service"));
    }

    @PluginMethod
    public void queryProductDetails(final PluginCall call) {
        JSArray productIdsArray = call.getArray("productIds");
        if (productIdsArray == null || productIdsArray.length() == 0) {
            call.reject("productIds array is required");
            return;
        }

        final List<QueryProductDetailsParams.Product> productList = new ArrayList<>();
        for (int i = 0; i < productIdsArray.length(); i++) {
            try {
                String pid = productIdsArray.getString(i);
                if (pid != null && !pid.trim().isEmpty()) {
                    productList.add(
                            QueryProductDetailsParams.Product.newBuilder()
                                    .setProductId(pid.trim())
                                    .setProductType(BillingClient.ProductType.SUBS)
                                    .build()
                    );
                }
            } catch (JSONException e) {
                Log.e(TAG, "Error parsing productId", e);
            }
        }

        ensureConnected(() -> {
            QueryProductDetailsParams queryParams = QueryProductDetailsParams.newBuilder()
                    .setProductList(productList)
                    .build();

            billingClient.queryProductDetailsAsync(queryParams, (billingResult, productDetailsResult) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Failed to query product details: " + billingResult.getDebugMessage());
                    return;
                }

                List<ProductDetails> productDetailsList = productDetailsResult != null ? productDetailsResult.getProductDetailsList() : new ArrayList<ProductDetails>();
                JSArray result = new JSArray();
                for (ProductDetails details : productDetailsList) {
                    JSObject item = new JSObject();
                    item.put("productId", details.getProductId());
                    item.put("title", details.getTitle());
                    item.put("description", details.getDescription());

                    List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                    if (offers != null && !offers.isEmpty()) {
                        ProductDetails.SubscriptionOfferDetails promoOffer = null;
                        ProductDetails.SubscriptionOfferDetails baseOffer = null;
                        JSArray offersArray = new JSArray();

                        for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                            JSObject offObj = new JSObject();
                            offObj.put("basePlanId", offer.getBasePlanId());
                            offObj.put("offerId", offer.getOfferId());
                            offObj.put("offerToken", offer.getOfferToken());

                            JSArray tagsArr = new JSArray();
                            if (offer.getOfferTags() != null) {
                                for (String t : offer.getOfferTags()) tagsArr.put(t);
                            }
                            offObj.put("tags", tagsArr);

                            List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                            if (!phases.isEmpty()) {
                                ProductDetails.PricingPhase ph = phases.get(0);
                                offObj.put("formattedPrice", ph.getFormattedPrice());
                                offObj.put("priceAmountMicros", ph.getPriceAmountMicros());
                                offObj.put("billingPeriod", ph.getBillingPeriod());
                            }
                            offersArray.put(offObj);

                            if (offer.getOfferId() != null && !offer.getOfferId().trim().isEmpty()) {
                                if (promoOffer == null) {
                                    promoOffer = offer;
                                }
                            } else if (baseOffer == null) {
                                baseOffer = offer;
                            }
                        }

                        item.put("offers", offersArray);

                        // Prioritize promotional/discount offer if present, otherwise use base plan offer
                        ProductDetails.SubscriptionOfferDetails chosenOffer = promoOffer != null ? promoOffer : (baseOffer != null ? baseOffer : offers.get(0));

                        item.put("basePlanId", chosenOffer.getBasePlanId());
                        item.put("offerToken", chosenOffer.getOfferToken());
                        if (chosenOffer.getOfferId() != null) {
                            item.put("offerId", chosenOffer.getOfferId());
                        }

                        List<ProductDetails.PricingPhase> phases = chosenOffer.getPricingPhases().getPricingPhaseList();
                        if (!phases.isEmpty()) {
                            ProductDetails.PricingPhase currentPhase = phases.get(0);
                            item.put("formattedPrice", currentPhase.getFormattedPrice());
                            item.put("priceAmountMicros", currentPhase.getPriceAmountMicros());
                            item.put("priceCurrencyCode", currentPhase.getPriceCurrencyCode());
                            item.put("billingPeriod", currentPhase.getBillingPeriod());

                            if (phases.size() > 1) {
                                ProductDetails.PricingPhase recurringPhase = phases.get(phases.size() - 1);
                                item.put("recurringFormattedPrice", recurringPhase.getFormattedPrice());
                                item.put("hasOffer", true);
                            } else if (promoOffer != null && baseOffer != null) {
                                List<ProductDetails.PricingPhase> basePhases = baseOffer.getPricingPhases().getPricingPhaseList();
                                if (!basePhases.isEmpty()) {
                                    item.put("recurringFormattedPrice", basePhases.get(0).getFormattedPrice());
                                    item.put("hasOffer", true);
                                }
                            }
                        }
                    }
                    result.put(item);
                }

                JSObject ret = new JSObject();
                ret.put("products", result);
                call.resolve(ret);
            });
        }, () -> call.reject("Could not connect to Google Play Billing service"));
    }

    @PluginMethod
    public void restorePurchases(final PluginCall call) {
        ensureConnected(() -> {
            QueryPurchasesParams queryParams = QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build();

            billingClient.queryPurchasesAsync(queryParams, (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject("Failed to query purchases: " + billingResult.getDebugMessage());
                    return;
                }

                JSArray activePurchases = new JSArray();
                for (Purchase p : purchases) {
                    if (p.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                        JSObject obj = new JSObject();
                        obj.put("orderId", p.getOrderId());
                        obj.put("purchaseToken", p.getPurchaseToken());
                        obj.put("purchaseTime", p.getPurchaseTime());
                        obj.put("products", new JSArray(p.getProducts()));
                        obj.put("isAcknowledged", p.isAcknowledged());
                        activePurchases.put(obj);
                    }
                }

                JSObject ret = new JSObject();
                ret.put("purchases", activePurchases);
                call.resolve(ret);
            });
        }, () -> call.reject("Could not connect to Google Play Billing service"));
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, @Nullable List<Purchase> purchases) {
        if (activePurchaseCall == null) return;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            Purchase purchase = purchases.get(0);
            handlePurchase(purchase, activePurchaseCall);
            activePurchaseCall = null;
        } else if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject ret = new JSObject();
            ret.put("canceled", true);
            activePurchaseCall.resolve(ret);
            activePurchaseCall = null;
        } else {
            activePurchaseCall.reject("Purchase failed: " + billingResult.getDebugMessage() + " (code " + billingResult.getResponseCode() + ")");
            activePurchaseCall = null;
        }
    }

    private void handlePurchase(Purchase purchase, PluginCall call) {
        if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
            if (!purchase.isAcknowledged()) {
                AcknowledgePurchaseParams ackParams = AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(purchase.getPurchaseToken())
                        .build();

                billingClient.acknowledgePurchase(ackParams, ackResult -> {
                    if (ackResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        Log.w(TAG, "Acknowledge warning: " + ackResult.getDebugMessage());
                    }
                });
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("orderId", purchase.getOrderId());
            ret.put("purchaseToken", purchase.getPurchaseToken());
            ret.put("purchaseTime", purchase.getPurchaseTime());
            ret.put("products", new JSArray(purchase.getProducts()));
            ret.put("isAcknowledged", true);
            call.resolve(ret);
        } else if (purchase.getPurchaseState() == Purchase.PurchaseState.PENDING) {
            JSObject ret = new JSObject();
            ret.put("pending", true);
            ret.put("orderId", purchase.getOrderId());
            call.resolve(ret);
        } else {
            call.reject("Unconfirmed purchase state: " + purchase.getPurchaseState());
        }
    }
}
