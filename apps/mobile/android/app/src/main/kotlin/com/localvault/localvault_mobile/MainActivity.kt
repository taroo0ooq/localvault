package com.localvault.localvault_mobile

import android.os.Bundle
import com.localvault.localvault_mobile.autofill.LocalVaultAutofillService
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : FlutterFragmentActivity() {
    private val channel = "com.localvault.mobile/autofill"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channel)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "publishDatasetIndex" -> {
                        val entries = call.argument<List<Map<String, String>>>("entries") ?: emptyList()
                        val arr = JSONArray()
                        for (e in entries) {
                            val o = JSONObject()
                            o.put("id", e["id"] ?: "")
                            o.put("title", e["title"] ?: "")
                            o.put("url", e["url"] ?: "")
                            o.put("username", e["username"] ?: "")
                            arr.put(o)
                        }
                        LocalVaultAutofillService.saveIndex(applicationContext, arr.toString())
                        result.success(true)
                    }
                    "notifyVaultUnlocked" -> {
                        LocalVaultAutofillService.setUnlocked(applicationContext, true)
                        result.success(true)
                    }
                    "notifyVaultLocked" -> {
                        LocalVaultAutofillService.setUnlocked(applicationContext, false)
                        LocalVaultAutofillService.clearPasswords(applicationContext)
                        result.success(true)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
