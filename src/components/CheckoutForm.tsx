import React, { useState, useEffect } from 'react';
import { useSubscription } from './SubscriptionProvider';
import { Loader2, ShieldCheck, AlertCircle } from 'lucide-react';
import { auth } from '../firebase';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export function CheckoutForm({ amount, clientSecret: orderId, selectedPlanId, onCancel, onSuccess, isSubscription = true }: { amount: number, clientSecret: string, selectedPlanId: string, onCancel: () => void, onSuccess: () => void, isSubscription?: boolean }) {
  const { formatPrice, currency } = useSubscription();
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  useEffect(() => {
    const loadRazorpay = () => {
      if (window.Razorpay) {
        setScriptLoaded(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => setScriptLoaded(true);
      script.onerror = () => setMessage("Failed to load payment gateway. Please check your internet connection.");
      document.body.appendChild(script);
    };
    loadRazorpay();
  }, []);

  const handlePayment = async () => {
    if (!scriptLoaded || !window.Razorpay) {
      setMessage("Payment gateway is still loading. Please wait a moment.");
      return;
    }

    setIsLoading(true);
    setMessage(null);

    const _subToken = await auth.currentUser?.getIdToken().catch(() => null);

    const options = {
      key: import.meta.env.VITE_RAZORPAY_KEY_ID || "",
      amount: Math.round(amount * 100),
      currency: currency.code,
      name: "PTE Ninja",
      description: isSubscription ? "Subscription Upgrade" : "Payment",
      order_id: orderId,
      handler: async function (response: any) {
        try {
          const verifyRes = await fetch('/api/verify-razorpay-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(_subToken ? { Authorization: `Bearer ${_subToken}` } : {}) },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              planId: selectedPlanId,
            })
          });
          const verifyData = await verifyRes.json();
          if (verifyRes.ok && verifyData.success) {
            onSuccess();
          } else {
            setMessage(verifyData.error || "Payment verification failed.");
            setIsLoading(false);
          }
        } catch (err) {
          console.error("Verification error", err);
          setMessage("An error occurred during payment verification.");
          setIsLoading(false);
        }
      },
      modal: {
        ondismiss: function() {
          setIsLoading(false);
        }
      },
      prefill: {
        email: auth.currentUser?.email || "",
      },
      theme: {
        color: "#45A29E"
      }
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', function (response: any){
        setMessage(response.error.description || "Payment failed.");
        setIsLoading(false);
      });
      rzp.open();
    } catch (e: any) {
      console.error(e);
      setMessage("Failed to open payment gateway.");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-sm">
          <AlertCircle size={18} className="shrink-0" />
          <span>{message}</span>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          onClick={handlePayment}
          disabled={isLoading || !scriptLoaded}
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
          Card details are stored securely — PTENinja never sees your card number.
        </p>
      )}
      
      <p className="text-[10px] text-[#C5C6C7]/30 text-center uppercase tracking-widest">
        Secure encrypted payment powered by Razorpay
      </p>
    </div>
  );
}
