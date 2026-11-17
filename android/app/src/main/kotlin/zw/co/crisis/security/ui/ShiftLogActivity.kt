package zw.co.crisis.security.ui

import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.widget.FrameLayout
import androidx.appcompat.app.AppCompatActivity
import zw.co.crisis.security.data.EventQueue
import zw.co.crisis.security.patrol.PatrolMessages
import zw.co.crisis.security.patrol.PatrolStore
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Shift log (handoff v2 "Log — proof of shift"): every scan and every message this shift, with how operations sees it. */
class ShiftLogActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())
    private val refresh = object : Runnable { override fun run() { render(); handler.postDelayed(this, 5000) } }
    private lateinit var chrome: GuardChrome
    private lateinit var holder: FrameLayout
    private var filter: LogRow.Kind? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        holder = FrameLayout(this)
        chrome = GuardChrome.install(this, holder, GuardChrome.Tab.LOG)
        render()
    }
    override fun onResume() { super.onResume(); handler.post(refresh) }
    override fun onPause() { handler.removeCallbacks(refresh); super.onPause() }

    private fun render() {
        holder.removeAllViews()
        holder.addView(GuardScreens.log(this, rows(), filter) { filter = it; render() })
        chrome.refreshSync()
    }

    private fun rows(): List<LogRow> {
        val f = SimpleDateFormat("HH:mm", Locale.getDefault())
        val scans = PatrolStore.get(this).recentRows(50).map { r ->
            val at = PatrolStore.time(r.capturedAt)
            LogMapper.patrol(r.checkpointName, r.state, r.decision, r.localDecision, f.format(Date(at)), at, PatrolMessages.result(r.state, r.decision, r.localDecision))
        }
        val alerts = EventQueue.get(this).recentComm(50, kind = "ALERT").map { r ->
            LogMapper.alert(r.type, AlertsActivity.labelFor(r.type), r.status, AlertsActivity.commStateText(this, r), f.format(Date(r.at)), r.at)
        }
        return scans + alerts
    }
}
