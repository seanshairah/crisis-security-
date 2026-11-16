package zw.co.crisis.security.patrol

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import zw.co.crisis.security.R
import zw.co.crisis.security.ui.MainActivity

object PatrolFeedback {
    @Synchronized fun confirmed(context: Context) {
        val store = PatrolStore.get(context)
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (!androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()) return
        if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("crisis_scan_results", "Patrol scan results", NotificationManager.IMPORTANCE_HIGH).apply { enableVibration(true) })
        for(row in store.successNotices()) {
            val open = PendingIntent.getActivity(context, row.eventId.hashCode(), Intent(context, MainActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val n = NotificationCompat.Builder(context,"crisis_scan_results").setSmallIcon(R.drawable.ic_verified).setContentTitle("Checkpoint verified ✓").setContentText("${row.checkpointName} · location matched").setContentIntent(open).setAutoCancel(true).setOnlyAlertOnce(true).setDefaults(NotificationCompat.DEFAULT_ALL).setPriority(NotificationCompat.PRIORITY_HIGH).build()
            try { nm.notify(row.eventId.hashCode(),n); store.markNotified(row.eventId) } catch(_: SecurityException) { return }
        }
    }
}
