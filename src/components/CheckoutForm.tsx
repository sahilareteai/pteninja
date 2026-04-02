import React, { useState } from 'react';
import { useSubscription } from './SubscriptionProvider';
import {
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Loader2, ShieldCheck, AlertCircle, ExternalLink } from 'lucide-react';

export function CheckoutForm({ amount, clientSecret, onCancel, onSuccess, isSubscription = true }: { amount: number, clientSecret: string, onCancel: () => void, onSuccess: () => void, isSubscription?: boolean }) {
  const stripe = useStripe();
  const elements = useElements();
  const { formatPrice } = useSubscription();

  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [manualRedirectUrl, setManualRedirectUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setManualRedirectUrl(null);

    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin,
        },
        redirect: 'if_required'
      });

      if (result.error) {
        if (result.error.type === "card_error" || result.error.type === "validation_error") {
          setMessage(result.error.message || "An error occurred");
        } else {
          setMessage(result.error.message || "An unexpected error occurred.");
        }
      } else if (result.paymentIntent && result.paymentIntent.status === 'succeeded') {
        onSuccess();
      } else if (result.paymentIntent && result.paymentIntent.status === 'requires_action') {
        if (result.paymentIntent.next_action?.redirect_to_url?.url) {
          setManualRedirectUrl(result.paymentIntent.next_action.redirect_to_url.url);
          setMessage("Your bank requires additional verification.");
        }
      }
    } catch (error: any) {
      console.error("Stripe confirmation error:", error);
      
      // Handle the specific iframe navigation error and its variations
      const errorMessage = error.message || "";
      const isNavigationError = 
        errorMessage.includes("permission to navigate") || 
        errorMessage.includes("set a named property 'href'") ||
        error.name === "SecurityError" ||
        errorMessage.includes("Location.href");

      if (isNavigationError) {
        try {
          // Try to retrieve the payment intent to get the redirect URL
          const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);
          if (paymentIntent?.next_action?.redirect_to_url?.url) {
            setManualRedirectUrl(paymentIntent.next_action.redirect_to_url.url);
            setMessage("Your bank requires additional verification. A security restriction in the preview prevented an automatic redirect. Please use the button below to complete the payment in a new tab.");
          } else if (paymentIntent?.status === 'succeeded') {
            onSuccess();
          } else {
            setMessage("A security restriction in the preview prevented the payment redirect. Please try opening the app in a new tab (using the icon in the top right) to complete the purchase.");
          }
        } catch (retrieveError) {
          console.error("Error retrieving payment intent:", retrieveError);
          setMessage("A security restriction in the preview prevented the payment redirect. Please try opening the app in a new tab to complete the purchase.");
        }
      } else {
        setMessage(error.message || "An error occurred while processing your payment. Please try again.");
      }
    }

    setIsLoading(false);
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-[#0B0C10] p-6 rounded-2xl border border-[#45A29E]/20">
        <PaymentElement id="payment-element" options={{ layout: 'tabs' }} />
      </div>
      
      {message && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {manualRedirectUrl && (
        <a
          href={manualRedirectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-4 bg-[#66FCF1] text-[#0B0C10] font-bold rounded-xl hover:bg-white transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(102,252,241,0.3)]"
        >
          <ExternalLink size={20} />
          Complete Verification
        </a>
      )}

      <div className="flex flex-col gap-3">
        {!manualRedirectUrl && (
          <button
            disabled={isLoading || !stripe || !elements}
            id="submit"
            className="w-full py-4 bg-[#45A29E] text-[#0B0C10] font-bold rounded-xl hover:bg-[#66FCF1] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(69,162,158,0.2)]"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <>
                <ShieldCheck size={20} />
                {isSubscription ? `Subscribe — ${formatPrice(amount)}` : `Pay ${formatPrice(amount)} Now`}
              </>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="w-full py-3 text-[#C5C6C7]/50 hover:text-white transition-colors text-sm"
        >
          Cancel and go back
        </button>
      </div>

      {isSubscription && (
        <p className="text-[10px] text-[#C5C6C7]/40 text-center leading-relaxed">
          Your subscription renews automatically. You can cancel anytime from your account.
          Card details are stored securely by Stripe — PTENinja never sees your card number.
        </p>
      )}
      
      <p className="text-[10px] text-[#C5C6C7]/30 text-center uppercase tracking-widest">
        Secure encrypted payment powered by Stripe
      </p>
    </form>
  );
}
