package com.gulbidi.neptune

import android.app.Activity
import android.content.Intent
import android.webkit.WebView
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.firebase.messaging.FirebaseMessaging
import java.util.UUID

@InvokeArg
class PushContextArgs {
  var accounts: List<String> = emptyList()
  var email: String? = null
  var chatId: String? = null
}

@TauriPlugin
class PushPlugin(private val activity: Activity) : Plugin(activity) {
  override fun load(webView: WebView) {
    super.load(webView)
    PushNotifications.createChannel(activity)
    rememberOpen(activity.intent)
  }

  override fun onNewIntent(intent: Intent) {
    rememberOpen(intent)
  }

  private fun rememberOpen(intent: Intent?) {
    val chatId = intent?.getStringExtra("chat_id") ?: return
    val email = intent.getStringExtra("account_email") ?: return
    val prefs = PushNotifications.preferences(activity)
    prefs.edit().putString("open", JSObject().put("chatId", chatId).put("email", email).toString()).apply()
    intent.removeExtra("chat_id")
    intent.removeExtra("account_email")
  }

  @Command
  fun getToken(invoke: Invoke) {
    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
      if (!task.isSuccessful) {
        invoke.reject("Could not register for push notifications. Check your connection.")
        return@addOnCompleteListener
      }
      val prefs = PushNotifications.preferences(activity)
      val installation = prefs.getString("installation", null) ?: UUID.randomUUID().toString().also {
        prefs.edit().putString("installation", it).apply()
      }
      invoke.resolve(JSObject().put("token", task.result).put("installationId", installation))
    }
  }

  @Command
  fun setContext(invoke: Invoke) {
    val args = invoke.parseArgs(PushContextArgs::class.java)
    PushNotifications.preferences(activity).edit()
      .putStringSet("accounts", args.accounts.toSet())
      .putString("email", args.email)
      .putString("chat", args.chatId)
      .apply()
    invoke.resolve()
  }

  @Command
  fun consumeOpen(invoke: Invoke) {
    val prefs = PushNotifications.preferences(activity)
    val raw = prefs.getString("open", null)
    prefs.edit().remove("open").apply()
    invoke.resolve(JSObject().put("open", raw?.let { JSObject(it) }))
  }
}
