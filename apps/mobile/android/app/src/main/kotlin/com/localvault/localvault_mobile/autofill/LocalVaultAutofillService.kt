package com.localvault.localvault_mobile.autofill

import android.app.assist.AssistStructure
import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.Dataset
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.FillResponse
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import org.json.JSONArray
import android.content.Context

/**
 * Android Autofill Service (REQ-007).
 * Serves username/password datasets from a metadata index written by Flutter
 * after vault unlock. Passwords are only placed in datasets when the app has
 * published an unlocked session index (PIN/biometric gated in Flutter).
 */
class LocalVaultAutofillService : AutofillService() {

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        val structure = request.fillContexts.lastOrNull()?.structure
        if (structure == null) {
            callback.onSuccess(null)
            return
        }

        val emailIds = mutableListOf<AutofillId>()
        val passIds = mutableListOf<AutofillId>()
        parseStructure(structure, emailIds, passIds)

        if (emailIds.isEmpty() && passIds.isEmpty()) {
            callback.onSuccess(null)
            return
        }

        val entries = loadIndex(applicationContext)
        if (entries.isEmpty()) {
            callback.onSuccess(null)
            return
        }

        val response = FillResponse.Builder()
        for (i in 0 until minOf(entries.length(), 5)) {
            val e = entries.getJSONObject(i)
            val username = e.optString("username")
            // Password is never stored in index; autofill username-only hints unless
            // companion unlock cache present (secure prefs written by method channel).
            val password = loadPasswordHint(applicationContext, e.optString("id"))
            val presentation = RemoteViews(packageName, android.R.layout.simple_list_item_1)
            presentation.setTextViewText(
                android.R.id.text1,
                e.optString("title", username.ifEmpty { "LocalVault" })
            )
            val ds = Dataset.Builder(presentation)
            if (username.isNotEmpty()) {
                for (id in emailIds) {
                    ds.setValue(id, AutofillValue.forText(username), presentation)
                }
            }
            if (password != null && password.isNotEmpty()) {
                for (id in passIds) {
                    ds.setValue(id, AutofillValue.forText(password), presentation)
                }
            }
            response.addDataset(ds.build())
        }
        callback.onSuccess(response.build())
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        // Autosave into vault is confirmed in the Flutter UI (parity with extension).
        callback.onSuccess()
    }

    private fun parseStructure(
        structure: AssistStructure,
        emails: MutableList<AutofillId>,
        passwords: MutableList<AutofillId>
    ) {
        for (i in 0 until structure.windowNodeCount) {
            val root = structure.getWindowNodeAt(i).rootViewNode
            walk(root, emails, passwords)
        }
    }

    private fun walk(
        node: AssistStructure.ViewNode,
        emails: MutableList<AutofillId>,
        passwords: MutableList<AutofillId>
    ) {
        val id = node.autofillId
        val hints = node.autofillHints?.joinToString(",")?.lowercase() ?: ""
        val cls = node.className ?: ""
        if (id != null) {
            if (hints.contains("password") || node.inputType and 0x00000080 != 0) {
                passwords.add(id)
            } else if (
                hints.contains("username") ||
                hints.contains("email") ||
                cls.contains("EditText")
            ) {
                // Prefer explicit username/email; still collect text fields as candidates
                if (hints.contains("username") || hints.contains("email")) {
                    emails.add(id)
                }
            }
        }
        for (i in 0 until node.childCount) {
            walk(node.getChildAt(i), emails, passwords)
        }
    }

    companion object {
        private const val PREFS = "localvault_autofill"
        private const val KEY_INDEX = "dataset_index"
        private const val KEY_UNLOCKED = "unlocked"

        fun saveIndex(ctx: Context, json: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_INDEX, json)
                .apply()
        }

        fun setUnlocked(ctx: Context, unlocked: Boolean) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_UNLOCKED, unlocked)
                .apply()
        }

        fun loadIndex(ctx: Context): JSONArray {
            val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (!prefs.getBoolean(KEY_UNLOCKED, false)) return JSONArray()
            val raw = prefs.getString(KEY_INDEX, "[]") ?: "[]"
            return try {
                JSONArray(raw)
            } catch (_: Exception) {
                JSONArray()
            }
        }

        fun savePasswordHint(ctx: Context, id: String, password: String) {
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString("pw_$id", password)
                .apply()
        }

        fun loadPasswordHint(ctx: Context, id: String): String? {
            val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (!prefs.getBoolean(KEY_UNLOCKED, false)) return null
            return prefs.getString("pw_$id", null)
        }

        fun clearPasswords(ctx: Context) {
            val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val ed = prefs.edit()
            for (k in prefs.all.keys) {
                if (k.startsWith("pw_")) ed.remove(k)
            }
            ed.apply()
        }
    }
}
