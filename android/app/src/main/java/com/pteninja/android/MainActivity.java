package com.pteninja.android;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Microphone permission is requested contextually when the user starts speaking practice,
        // rather than interrupting app launch before onboarding.
    }
}
