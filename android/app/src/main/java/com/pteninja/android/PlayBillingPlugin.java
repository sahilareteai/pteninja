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

    /**
     * Checks if a billing period string matches the expected cadence for a given basePlanId or productId.
     */
    private boolean isCadenceCompatible(String billingPeriod, String basePlanId, String productId) {
        if (billingPeriod == null || billingPeriod.trim().isEmpty()) {
            return true;
        }
        String bp = billingPeriod.toUpperCase().trim();
        String context = ((basePlanId != null ? basePlanId : "") + " " + (productId != null ? productId : "")).toLowerCase();

        if (context.contains("week")) {
            // Weekly subscription: billing period must be 1 week (e.g. P1W, P7D).
            // Reject any offer configured with a 1-month (P1M), 3-month (P3M), or 1-year (P1Y) period.
            return (bp.contains("W") || bp.contains("7D")) && !bp.contains("M") && !bp.contains("Y");
        } else if (context.contains("quarter")) {
            // Quarterly subscription: billing period must be 3 months (P3M, P90D).
            return bp.contains("3M") || bp.contains("90D");
        } else if (context.contains("annual") || context.contains("year")) {
            // Annual subscription: billing period must be 1 year (P1Y, P12M, P365D).
            return bp.contains("Y") || bp.contains("12M") || bp.contains("365D");
        } else if (context.contains("month")) {
            // Monthly subscription: billing period must be 1 month (P1M, P30D).
            // Reject weekly, quarterly, or annual offers.
            return (bp.contains("1M") || bp.contains("30D") || bp.equals("PM") || bp.equals("P1M"))
                    && !bp.contains("3M") && !bp.contains("6M") && !bp.contains("12M") && !bp.contains("W") && !bp.contains("Y");
        }
        return true;
    }

    /**
     * Verifies that all pricing phases of an offer are compatible with the product / base plan cadence.
     */
    private boolean isOfferCadenceCompatible(ProductDetails.SubscriptionOfferDetails offer, String basePlanId, String productId) {
        if (offer == null) return false;
        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
        if (phases == null || phases.isEmpty()) return true;
        for (ProductDetails.PricingPhase ph : phases) {
            String bp = ph.getBillingPeriod();
            if (bp != null && !bp.trim().isEmpty()) {
                if (!isCadenceCompatible(bp, basePlanId, productId)) {
                    return false;
                }
            }
        }
        return true;
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
                ProductDetails.SubscriptionOfferDetails bestDiscountOffer = null;
                ProductDetails.SubscriptionOfferDetails cheapestOffer = null;
                long lowestDiscountPriceMicros = Long.MAX_VALUE;
                long lowestOverallPriceMicros = Long.MAX_VALUE;

                for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                    boolean baseMatches = (basePlanId == null || basePlanId.trim().isEmpty() || basePlanId.trim().equalsIgnoreCase(offer.getBasePlanId()));
                    if (!baseMatches) continue;

                    // Enforce strict cadence matching: prevent selecting an offer whose billing period
                    // does not match the product/base plan cadence (e.g. 1-month offer for a weekly plan)
                    if (!isOfferCadenceCompatible(offer, basePlanId, productId)) {
                        Log.w(TAG, "Skipping offer " + offer.getOfferId() + " for " + productId + " due to cadence mismatch with " + basePlanId);
                        continue;
                    }

                    List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                    long initialPriceMicros = Long.MAX_VALUE;
                    if (!phases.isEmpty()) {
                        initialPriceMicros = phases.get(0).getPriceAmountMicros();
                        if (initialPriceMicros < lowestOverallPriceMicros) {
                            lowestOverallPriceMicros = initialPriceMicros;
                            cheapestOffer = offer;
                        }
                    }

                    // Track standard base plan offer (no promotional offerId)
                    if (offer.getOfferId() == null || offer.getOfferId().trim().isEmpty()) {
                        if (basePlanOffer == null) {
                            basePlanOffer = offer;
                        }
                    } else {
                        // Track active discounted/promotional offer for this base plan
                        if (initialPriceMicros < lowestDiscountPriceMicros) {
                            lowestDiscountPriceMicros = initialPriceMicros;
                            bestDiscountOffer = offer;
                        }
                    }

                    // Check if offerId, promoCode, or offer tags match specifically
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
                            if (hasPromo && (t.contains("diwali") || t.contains("diwali20") || t.contains("promo") || t.contains("discount") || t.contains("sale") || t.contains("offer"))) {
                                matchesTags = true;
                            }
                        }
                    }

                    if (offer.getOfferId() != null) {
                        String offIdLower = offer.getOfferId().toLowerCase();
                        if (hasPromo && (offIdLower.contains("diwali") || offIdLower.contains("diwali20") || offIdLower.contains("promo") || offIdLower.contains("discount") || offIdLower.contains("sale") || offIdLower.contains("offer"))) {
                            matchesTags = true;
                        }
                    }

                    if (matchesOfferId || matchesPromoCode || matchesTags) {
                        matchingPromoOffer = offer;
                    }
                }

                // Determine selected offer:
                // 1) If an explicit offer/promo matched, use it
                // 2) Otherwise if an active discounted offer exists on Google Play for this base plan, use it!
                // 3) Otherwise fall back to the standard base plan offer
                if (matchingPromoOffer != null) {
                    selectedOffer = matchingPromoOffer;
                } else if (bestDiscountOffer != null) {
                    selectedOffer = bestDiscountOffer;
                } else if (cheapestOffer != null) {
                    selectedOffer = cheapestOffer;
                } else if (basePlanOffer != null) {
                    selectedOffer = basePlanOffer;
                } else {
                    // Fallback to first cadence-compatible offer, or offers.get(0)
                    for (ProductDetails.SubscriptionOfferDetails o : offers) {
                        if (isOfferCadenceCompatible(o, basePlanId, productId)) {
                            selectedOffer = o;
                            break;
                        }
                    }
                    if (selectedOffer == null) {
                        selectedOffer = offers.get(0);
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

                            // Only consider cadence-compatible offers for canonical baseOffer and promoOffer
                            // (e.g. prevent picking an offer with 1-month billing period for a weekly subscription)
                            if (isOfferCadenceCompatible(offer, offer.getBasePlanId(), details.getProductId())) {
                                if (offer.getOfferId() != null && !offer.getOfferId().trim().isEmpty()) {
                                    if (promoOffer == null) {
                                        promoOffer = offer;
                                    }
                                } else if (baseOffer == null) {
                                    baseOffer = offer;
                                }
                            }
                        }

                        item.put("offers", offersArray);

                        // Canonical base offer details matching cadence
                        ProductDetails.SubscriptionOfferDetails basePlanDetails = baseOffer;
                        if (basePlanDetails == null) {
                            for (ProductDetails.SubscriptionOfferDetails o : offers) {
                                if (isOfferCadenceCompatible(o, o.getBasePlanId(), details.getProductId())) {
                                    basePlanDetails = o;
                                    break;
                                }
                            }
                        }
                        if (basePlanDetails == null) {
                            basePlanDetails = offers.get(0);
                        }
                        item.put("basePlanId", basePlanDetails.getBasePlanId());

                        // If an active discount offer exists on Play Console matching cadence, expose its offerToken and offerId directly:
                        if (promoOffer != null && promoOffer.getOfferId() != null && !promoOffer.getOfferId().trim().isEmpty()) {
                            item.put("offerId", promoOffer.getOfferId());
                            item.put("offerToken", promoOffer.getOfferToken());
                            item.put("hasOffer", true);

                            List<ProductDetails.PricingPhase> promoPhases = promoOffer.getPricingPhases().getPricingPhaseList();
                            if (!promoPhases.isEmpty()) {
                                item.put("introductoryPrice", promoPhases.get(0).getFormattedPrice());
                                item.put("introductoryPriceAmountMicros", promoPhases.get(0).getPriceAmountMicros());
                            }
                        } else {
                            item.put("offerToken", basePlanDetails.getOfferToken());
                            if (basePlanDetails.getOfferId() != null) {
                                item.put("offerId", basePlanDetails.getOfferId());
                            }
                        }

                        // Provide canonical base plan pricing for standard display
                        List<ProductDetails.PricingPhase> basePhases = basePlanDetails.getPricingPhases().getPricingPhaseList();
                        if (!basePhases.isEmpty()) {
                            ProductDetails.PricingPhase currentPhase = basePhases.get(0);
                            item.put("formattedPrice", currentPhase.getFormattedPrice());
                            item.put("priceAmountMicros", currentPhase.getPriceAmountMicros());
                            item.put("priceCurrencyCode", currentPhase.getPriceCurrencyCode());
                            item.put("billingPeriod", currentPhase.getBillingPeriod());

                            if (basePhases.size() > 1) {
                                ProductDetails.PricingPhase recurringPhase = basePhases.get(basePhases.size() - 1);
                                item.put("recurringFormattedPrice", recurringPhase.getFormattedPrice());
                                item.put("hasOffer", true);
                            } else {
                                item.put("recurringFormattedPrice", currentPhase.getFormattedPrice());
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
