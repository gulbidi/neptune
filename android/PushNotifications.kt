package com.gulbidi.neptune

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** FCM displays background notifications itself; this handles foreground delivery. */
class NeptuneMessagingService : FirebaseMessagingService() {
  override fun onNewToken(token: String) {
    // The frontend reconciles tokens on launch, resume and every minute while open.
    PushNotifications.preferences(this).edit().putString("token", token).apply()
  }

  override fun onMessageReceived(message: RemoteMessage) {
    PushNotifications.show(this, message)
  }
}

object PushNotifications {
  const val CHANNEL = "neptune_replies"
  @Volatile var foreground = false

  fun preferences(context: Context) = context.getSharedPreferences("neptune_push", Context.MODE_PRIVATE)

  fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, "Agent replies", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Replies and task updates from your PCs"
        }
      )
    }
  }

  fun show(context: Context, message: RemoteMessage) {
    val data = message.data
    val email = data["account_email"] ?: return
    val chatId = data["chat_id"] ?: return
    val messageId = data["message_id"] ?: return
    val prefs = preferences(context)
    if (!prefs.getStringSet("accounts", emptySet())!!.contains(email)) return
    if (foreground && prefs.getString("email", null) == email && prefs.getString("chat", null) == chatId) return
    val seen = prefs.getStringSet("seen", emptySet())!!.toMutableSet()
    if (!seen.add(messageId)) return
    if (seen.size > 200) seen.clear().also { seen.add(messageId) }
    prefs.edit().putStringSet("seen", seen).apply()
    createChannel(context)
    val intent = Intent(context, MainActivity::class.java).apply {
      flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra("chat_id", chatId)
      putExtra("account_email", email)
      // Distinct intents prevent another notification from overwriting the tap target.
      action = "neptune.reply.$messageId"
    }
    val tap = PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(context, CHANNEL)
      .setSmallIcon(R.drawable.ic_notification)
      .setColor(0xFF22C55E.toInt())
      .setContentTitle(message.notification?.title ?: "Neptune")
      .setContentText(message.notification?.body ?: "Your agent replied")
      .setContentIntent(tap)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .build()
    if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      try {
        NotificationManagerCompat.from(context).notify(messageId, 0, notification)
      } catch (_: SecurityException) {
        // Android 13+ can revoke permission while a message is arriving.
      }
    }
  }
}
