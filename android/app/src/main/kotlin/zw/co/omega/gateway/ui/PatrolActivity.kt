package zw.co.omega.gateway.ui

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.widget.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.*
import org.json.JSONObject
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import zw.co.omega.gateway.patrol.CheckpointCode
import zw.co.omega.gateway.patrol.CoordinateCheckpoint
import zw.co.omega.gateway.patrol.PatrolMessages
import zw.co.omega.gateway.service.GatewayService
import java.util.UUID
import zw.co.omega.gateway.data.Prefs
import zw.co.omega.gateway.location.AcquisitionPolicy
import zw.co.omega.gateway.location.LocationMonitor
import zw.co.omega.gateway.model.GatewayEvent
import zw.co.omega.gateway.net.ApiClient
import zw.co.omega.gateway.patrol.PatrolRuntime
import zw.co.omega.gateway.patrol.PatrolStore
import zw.co.omega.gateway.patrol.PatrolWindows

/** Individual guard sessions on a company handset. No PINs stored on the phone. */
class PatrolActivity : AppCompatActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private lateinit var column: LinearLayout
    private lateinit var status: TextView
    private lateinit var store: PatrolStore
    private lateinit var prefs: Prefs
    private var selected: JSONObject? = null
    private var selectedSession: JSONObject? = null
    private var busy = false
    private var feedbackMessage = ""
    private var feedbackError = false
    private val handler = Handler(Looper.getMainLooper())
    private val refresh = object : Runnable { override fun run() { if (!busy && store.config()?.optJSONObject("session")?.let { System.currentTimeMillis() < PatrolStore.time(it.getString("expiresAt")) } == true) render(); handler.postDelayed(this, 10000) } }
    private val scanner = registerForActivityResult(ScanContract()) { result ->
        val qr = result.contents
        val a = selected; val s = selectedSession
        if (qr != null && a != null && s != null) capture(s, a, qr)
    }
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = Prefs(this); store = PatrolStore.get(this)
        val scroll = ScrollView(this).apply { setBackgroundResource(zw.co.omega.gateway.R.drawable.bg_field_camo) }
        val padding = (16 * resources.displayMetrics.density).toInt()
        column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(padding,padding,padding,padding) }
        scroll.addView(column); setContentView(scroll)
        Insets.applySystemBars(scroll)
        render()
        runAction { withContext(Dispatchers.IO) { PatrolRuntime(this@PatrolActivity).sync(api()) }; "Ready for your shift." }
    }
    override fun onResume() { super.onResume(); GatewayService.start(this); handler.postDelayed(refresh, 3000) }
    override fun onPause() { handler.removeCallbacks(refresh); super.onPause() }
    override fun onDestroy() { scope.cancel(); super.onDestroy() }
    private fun localTime(value: String): String = android.text.format.DateFormat.getTimeFormat(this).format(java.util.Date(PatrolStore.time(value)))
    private fun api() = ApiClient(prefs.serverUrl, prefs.deviceToken)
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt()
    private val ink = Color.rgb(237,240,238)
    private val muted = Color.rgb(169,180,174)
    private fun panel(color: Int = Color.rgb(29,35,32)) = GradientDrawable().apply { setColor(color); cornerRadius = dp(18).toFloat(); setStroke(dp(1),Color.rgb(57,67,60)) }
    private fun label(text: String, size: Float = 15f) = TextView(this).apply {
        this.text = text; textSize = size; setTextColor(if(size <= 12f) muted else ink)
        setPadding(dp(4),dp(9),dp(4),dp(9)); if(size >= 19f) setTypeface(typeface,Typeface.BOLD)
        column.addView(this)
    }
    private fun button(text: String, action: () -> Unit) {
        column.addView(com.google.android.material.button.MaterialButton(this).apply {
            this.text = text; isAllCaps = false; textSize = 16f; minHeight = dp(56); cornerRadius = dp(16)
            setTextColor(ink); backgroundTintList = android.content.res.ColorStateList.valueOf(if(text.startsWith("Scan") || text.startsWith("Sign in")) Color.rgb(67,86,72) else if(text.startsWith("Emergency")) Color.rgb(123,45,43) else Color.rgb(40,48,43))
            layoutParams = LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(6); bottomMargin=dp(6) }
            isEnabled = !busy; setOnClickListener { if(!busy) action() }
        })
    }
    private fun render(message: String = feedbackMessage, error: Boolean = feedbackError) {
        feedbackMessage = message; feedbackError = error
        column.removeAllViews()
        label("◈  CRISIS SECURITY", 12f)
        label("Field operations", 28f)
        label("Scan the checkpoint when this phone prompts you.", 12f)
        status = label(message).apply {
            accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
            if(error) { background=panel(Color.rgb(68,36,35)); setPadding(dp(16),dp(16),dp(16),dp(16)) }
        }
        val recent = store.recentRows()
        recent.firstOrNull()?.let { row ->
            val accepted = row.decision == "ACCEPTED"
            val localFailed = row.state == "QUEUED" && row.localDecision != null && row.localDecision != "LOCAL_MATCH"
            val result = PatrolMessages.result(row.state,row.decision,row.localDecision)
            label("LATEST SCAN · ${localTime(row.capturedAt)}",12f)
            label((if(accepted) "✓  " else if(row.state == "QUEUED" && !localFailed) "◷  " else "!  ") + row.checkpointName + "\n" + result, 19f).apply {
                background = panel(if(accepted) Color.rgb(27,62,43) else if(row.state=="QUEUED" && !localFailed) Color.rgb(64,53,28) else Color.rgb(68,36,35))
                setPadding(dp(16),dp(16),dp(16),dp(16))
            }
        }
        label(if(store.meta("lastError") != null) "Connection unavailable · ${store.pendingCount()} scans saved on this phone" else "${store.pendingCount()} scans awaiting confirmation",12f)
        val s = store.config()?.optJSONObject("session")
        if (s == null || System.currentTimeMillis() >= PatrolStore.time(s.getString("expiresAt"))) {
            label("Enter your guard number and PIN to start your shift. You need a connection to sign in.")
            val guard = EditText(this).apply { hint = "Guard number"; setTextColor(Color.WHITE); setHintTextColor(Color.LTGRAY); column.addView(this) }
            val pin = EditText(this).apply { hint = "6–12 digit PIN"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD; setTextColor(Color.WHITE); setHintTextColor(Color.LTGRAY); column.addView(this) }
            button("Sign in for shift") {
                val no = guard.text.toString(); val code = pin.text.toString(); pin.text.clear()
                runAction { val cfg = withContext(Dispatchers.IO) { api().patrolLogin(no, code) }; store.saveConfig(cfg); prefs.guardName = cfg.optJSONObject("session")?.optString("guardName") ?: ""; prefs.lastFixAt = 0L; withContext(Dispatchers.IO) { zw.co.omega.gateway.service.SyncEngine(this@PatrolActivity).refreshConfig() }; "Signed in" }
            }
        } else {
            label(s.getString("guardName"), 22f); label(s.getString("siteName"))
            label("Shift ends ${localTime(s.getString("expiresAt"))}", 12f)
            val assignments = s.getJSONArray("assignments"); val now = System.currentTimeMillis()
            var open = 0
            for (i in 0 until assignments.length()) {
                val a = assignments.getJSONObject(i)
                if (a.optString("status") == "COMPLETED" || store.hasScan(a.getString("id"))) continue
                val due = PatrolStore.time(a.getString("dueAt")); val end = PatrolStore.time(a.getString("expiresAt"))
                if (PatrolWindows.isOpen(now, due, end, PatrolStore.time(s.getString("expiresAt")))) {
                    open++; label("DUE NOW / ${a.getString("checkpointName")}", 19f)
                    label("Scan by ${localTime(a.getString("expiresAt"))}", 12f)
                    button("Scan checkpoint QR") {
                        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 71); status.text = "Grant precise location, then tap Scan again"; return@button }
                        selected = a; selectedSession = s
                        scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Scan ${a.getString("checkpointName")}").setBeepEnabled(true).setCaptureActivity(PatrolCaptureActivity::class.java).setOrientationLocked(false).setTimeout((PatrolStore.time(a.getString("expiresAt")) - System.currentTimeMillis()).coerceAtLeast(1000L)))
                    }
                }
            }
            if (open == 0) label("No checkpoint is due right now. Keep this phone with you — it will notify you when the next checkpoint is due.")
            button("Sync evidence now") { runAction { withContext(Dispatchers.IO) { PatrolRuntime(this@PatrolActivity).sync(api()) }; "Connected. Scan results updated." } }
            button("End session / hand over") { runAction { withContext(Dispatchers.IO) { api().patrolLogout(s.getString("id")) }; store.clearSession(); prefs.guardName = ""; prefs.lastFixAt = 0L; withContext(Dispatchers.IO) { zw.co.omega.gateway.service.SyncEngine(this@PatrolActivity).refreshConfig() }; "Session ended. Next guard can sign in." } }
        }
        if(recent.isNotEmpty()) label("RECENT SCANS",12f)
        recent.drop(1).forEach { label("${it.checkpointName} · ${PatrolMessages.result(it.state, it.decision, it.localDecision)}",12f) }
        button("Emergency / SOS") { AlertFlow.confirmEmergency(this, AlertFlow.Feedback { text, _ -> render(text) }) }
        button("Help & messages") { startActivity(Intent(this, AlertsActivity::class.java)) }
        button("Phone settings") { startActivity(Intent(this, SettingsActivity::class.java)) }
        if(zw.co.omega.gateway.util.DeviceInfo.locationPermission(this) == "denied") button("Enable precise location") { startActivity(Intent(this, PermissionsActivity::class.java)) }
        if(!androidx.core.app.NotificationManagerCompat.from(this).areNotificationsEnabled()) button("Enable patrol notifications") { startActivity(Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(android.provider.Settings.EXTRA_APP_PACKAGE,packageName)) }
        if (!androidx.core.location.LocationManagerCompat.isLocationEnabled(getSystemService(LOCATION_SERVICE) as android.location.LocationManager)) button("Turn on phone location") { startActivity(Intent(android.provider.Settings.ACTION_LOCATION_SOURCE_SETTINGS)) }
        label("Green means verified. Amber means safely saved and waiting for confirmation. Keep location and notifications enabled.",12f)
    }
    private fun runAction(action: suspend () -> String) {
        if (busy) return
        busy = true; status.text = "Working…"
        scope.launch {
            val message = try { action() }
            catch (e: ApiClient.ApiException) { if (e.status in 400..499) e.message ?: "Please check your details and try again." else "Cannot reach Crisis right now. Your patrol plan and saved scans are kept on this phone." }
            catch (e: java.io.IOException) { "Cannot reach Crisis right now. Your patrol plan and saved scans are kept on this phone." }
            catch (e: Exception) { e.message ?: "Unable to finish. Please try again." }
            busy = false; render(message,false)
        }
    }
    private fun capture(s: JSONObject, a: JSONObject, qr: String) {
        val hash = CheckpointCode.sha256(qr)
        if (hash != a.getString("qrHash")) { render("Wrong checkpoint QR. Scan ${a.getString("checkpointName")}. ",true); return }
        val checkpoint = CheckpointCode.verified(qr,a.getString("qrHash"),CoordinateCheckpoint(a.getString("checkpointId"),s.getString("siteId"),a.optDouble("latitude"),a.optDouble("longitude"),a.optInt("radiusM")))
        if(checkpoint == null) { render("This sign needs updating. Ask your supervisor for a coordinate QR sign, then sync this phone.",true); return }
        runAction {
            val now = System.currentTimeMillis()
            if (!PatrolWindows.isOpen(now, PatrolStore.time(a.getString("dueAt")), PatrolStore.time(a.getString("expiresAt")), PatrolStore.time(s.getString("expiresAt")))) throw IllegalStateException("Patrol window closed")
            status.text = "QR read. Getting a fresh location — this may take up to a minute…"
            val monitor = LocationMonitor(this@PatrolActivity)
            val fix = withContext(Dispatchers.IO) { monitor.acquireForRequest(AcquisitionPolicy(acceptableM = 30f)) }
            val event = JSONObject().put("eventId", UUID.randomUUID().toString()).put("sessionId", s.getString("id")).put("assignmentId", a.getString("id")).put("qr", qr).put("capturedAt", GatewayEvent.iso(now)).put("gpsCapturedAt", fix?.let { GatewayEvent.iso(it.time) } ?: JSONObject.NULL)
                .put("latitude", fix?.latitude ?: JSONObject.NULL).put("longitude", fix?.longitude ?: JSONObject.NULL).put("accuracyM", fix?.accuracy?.toDouble() ?: JSONObject.NULL).put("mock", fix?.let { monitor.isMockFix(it) } ?: false)
            val localDecision = if(fix != null && !CheckpointCode.gpsTimeValid(now,fix.time,System.currentTimeMillis())) "GPS_TIME_UNCERTAIN" else CheckpointCode.locationDecision(checkpoint,fix?.latitude,fix?.longitude,fix?.accuracy,fix?.let { monitor.isMockFix(it) } ?: false)
            withContext(Dispatchers.IO) { store.enqueue(event,a.getString("checkpointName"),localDecision) }
            if(localDecision == "LOCAL_MATCH") {
                status.performHapticFeedback(android.view.HapticFeedbackConstants.CONFIRM)
                status.text = "Location matched. Scan saved — awaiting confirmation…"
            }
            // Upload is independent of capture. Failed transport never rolls back a queued scan.
            withContext(Dispatchers.IO) { runCatching { PatrolRuntime(this@PatrolActivity).sync(api()) } }
            val receipt = store.recentRows().firstOrNull { it.eventId == event.getString("eventId") }
            if(receipt?.decision == "ACCEPTED") "Checkpoint verified ✓" else if(localDecision != "LOCAL_MATCH") PatrolMessages.result("RECEIVED",localDecision) else "Scan saved · awaiting confirmation"
        }
    }
}
