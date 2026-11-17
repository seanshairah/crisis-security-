package zw.co.crisis.security.ui

import android.Manifest
import android.content.pm.PackageManager
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
import androidx.core.content.res.ResourcesCompat
import zw.co.crisis.security.R
import zw.co.crisis.security.patrol.CheckpointCode
import zw.co.crisis.security.patrol.CoordinateCheckpoint
import zw.co.crisis.security.patrol.PatrolMessages
import zw.co.crisis.security.patrol.ScanOutcome
import zw.co.crisis.security.service.GatewayService
import java.util.UUID
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.location.AcquisitionPolicy
import zw.co.crisis.security.location.LocationMonitor
import zw.co.crisis.security.model.GatewayEvent
import zw.co.crisis.security.net.ApiClient
import zw.co.crisis.security.patrol.PatrolRuntime
import zw.co.crisis.security.patrol.PatrolStore
import zw.co.crisis.security.patrol.PatrolWindows

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
        val scroll = ScrollView(this).apply { setBackgroundColor(getColor(R.color.surface2)) }
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
    // Colours come from the theme resources, so this screen follows the light/dark setting like every other.
    private val ink get() = getColor(R.color.ink)
    private val muted get() = getColor(R.color.ink2)
    private fun panel(color: Int = getColor(R.color.surface)) = GradientDrawable().apply { setColor(color); cornerRadius = dp(24).toFloat(); setStroke(dp(1),getColor(R.color.line)) }
    private fun label(text: String, size: Float = 15f) = TextView(this).apply {
        this.text = text; textSize = size; setTextColor(if(size <= 12f) muted else ink)
        setPadding(dp(4),dp(9),dp(4),dp(9)); if(size >= 19f) setTypeface(typeface,Typeface.BOLD)
        column.addView(this)
    }
    private fun button(text: String, action: () -> Unit) {
        column.addView(com.google.android.material.button.MaterialButton(this).apply {
            this.text = text; isAllCaps = false; textSize = 16f; minHeight = dp(56); cornerRadius = dp(28)
            val primary = text.startsWith("Scan") || text.startsWith("Sign in"); val emergency = text.startsWith("Emergency")
            setTextColor(getColor(if (primary) R.color.on_accent else if (emergency) R.color.white else R.color.ink)); backgroundTintList = android.content.res.ColorStateList.valueOf(getColor(if (primary) R.color.accent else if (emergency) R.color.critical_solid else R.color.surface3))
            layoutParams = LinearLayout.LayoutParams(-1,-2).apply { topMargin=dp(6); bottomMargin=dp(6) }
            isEnabled = !busy; setOnClickListener { if(!busy) action() }
        })
    }
    /** Title in the display serif, then where and when. Night shifts read "Tonight's patrol". */
    private fun header(session: JSONObject?) {
        label("CRISIS SECURITY", 12f)
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        val title = if (session == null) "Field operations" else if (hour >= 18 || hour < 6) "Tonight's patrol" else "Today's patrol"
        label(title, 36f).apply { typeface = ResourcesCompat.getFont(this@PatrolActivity, R.font.display) }
        label(session?.let { "${it.getString("siteName")} · ${localTime(it.getString("startedAt"))}–${localTime(it.getString("expiresAt"))}" } ?: "Scan the checkpoint when this phone prompts you.", 13f)
    }

    /** Shift, Location, Synced: three tiles, each a word and a colour, never colour alone. Unknown is amber, never red. */
    private fun statusTiles(session: JSONObject?) {
        val pending = store.pendingCount()
        val loc = prefs.lastFixState
        val tiles = listOf(
            Triple("Shift", if (session == null) "Not signed in" else "Ends ${localTime(session.getString("expiresAt"))}", if (session == null) R.color.warn_soft else R.color.ok_soft),
            Triple("Location", when (loc) { "INSIDE" -> "Inside site"; "OUTSIDE" -> "Outside site"; else -> "Checking" }, when (loc) { "INSIDE" -> R.color.ok_soft; "OUTSIDE" -> R.color.critical_soft; else -> R.color.warn_soft }),
            Triple("Synced", if (pending == 0) "Up to date" else "$pending saved", if (pending == 0) R.color.ok_soft else R.color.warn_soft),
        )
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        tiles.forEachIndexed { i, (name, value, tint) ->
            row.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL; background = panel(getColor(tint)); setPadding(dp(12), dp(12), dp(12), dp(12))
                addView(TextView(this@PatrolActivity).apply { text = name; textSize = 12f; setTextColor(muted) })
                addView(TextView(this@PatrolActivity).apply { text = value; textSize = 15f; setTextColor(ink); setTypeface(typeface, Typeface.BOLD) })
                contentDescription = "$name: $value"
                layoutParams = LinearLayout.LayoutParams(0, -2, 1f).apply { if (i > 0) marginStart = dp(8) }
            })
        }
        column.addView(row, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8); bottomMargin = dp(8) })
    }

    private fun render(message: String = feedbackMessage, error: Boolean = feedbackError) {
        feedbackMessage = message; feedbackError = error
        column.removeAllViews()
        val live = store.config()?.optJSONObject("session")?.takeIf { System.currentTimeMillis() < PatrolStore.time(it.getString("expiresAt")) }
        header(live)
        statusTiles(live)
        status = label(message).apply {
            accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
            if(error) { background=panel(getColor(R.color.critical_soft)); setPadding(dp(16),dp(16),dp(16),dp(16)) }
        }
        val recent = store.recentRows()
        recent.firstOrNull()?.let { row ->
            val accepted = row.decision == "ACCEPTED"
            val localFailed = row.state == "QUEUED" && row.localDecision != null && row.localDecision != "LOCAL_MATCH"
            val result = PatrolMessages.result(row.state,row.decision,row.localDecision)
            label("LATEST SCAN · ${localTime(row.capturedAt)}",12f)
            label((if(accepted) "✓  " else if(row.state == "QUEUED" && !localFailed) "◷  " else "!  ") + row.checkpointName + "\n" + result, 19f).apply {
                background = panel(getColor(if(accepted) R.color.ok_soft else if(row.state=="QUEUED" && !localFailed) R.color.warn_soft else R.color.critical_soft))
                setPadding(dp(16),dp(16),dp(16),dp(16))
            }
        }
        label(if(store.meta("lastError") != null) "Connection unavailable · ${store.pendingCount()} scans saved on this phone" else "${store.pendingCount()} scans awaiting confirmation",12f)
        val s = store.config()?.optJSONObject("session")
        if (s == null || System.currentTimeMillis() >= PatrolStore.time(s.getString("expiresAt"))) {
            label("Enter your guard number and PIN to start your shift. You need a connection to sign in.")
            val guard = EditText(this).apply { hint = "Guard number"; setTextColor(ink); setHintTextColor(getColor(R.color.ink3)); column.addView(this) }
            val pin = EditText(this).apply { hint = "6–12 digit PIN"; inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_VARIATION_PASSWORD; setTextColor(ink); setHintTextColor(getColor(R.color.ink3)); column.addView(this) }
            button("Sign in for shift") {
                val no = guard.text.toString(); val code = pin.text.toString(); pin.text.clear()
                runAction { val cfg = withContext(Dispatchers.IO) { api().patrolLogin(no, code) }; store.saveConfig(cfg); prefs.guardName = cfg.optJSONObject("session")?.optString("guardName") ?: ""; prefs.lastFixAt = 0L; withContext(Dispatchers.IO) { zw.co.crisis.security.service.SyncEngine(this@PatrolActivity).refreshConfig() }; "Signed in" }
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
                    open++
                    label("Next up · ${a.getString("checkpointName")}\nScan by ${localTime(a.getString("expiresAt"))}", 19f).apply { background = panel(getColor(R.color.warn_soft)); setPadding(dp(16),dp(16),dp(16),dp(16)) }
                    button("Scan checkpoint QR") {
                        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION), 71); status.text = "Grant precise location, then tap Scan again"; return@button }
                        selected = a; selectedSession = s
                        scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Scan ${a.getString("checkpointName")}").setBeepEnabled(true).setCaptureActivity(PatrolCaptureActivity::class.java).setOrientationLocked(false).setTimeout((PatrolStore.time(a.getString("expiresAt")) - System.currentTimeMillis()).coerceAtLeast(1000L)))
                    }
                }
            }
            if (open == 0) label("Next check: at a random time. We will alert you.")
            button("Sync evidence now") { runAction { withContext(Dispatchers.IO) { PatrolRuntime(this@PatrolActivity).sync(api()) }; "Connected. Scan results updated." } }
            button("End session / hand over") { runAction { withContext(Dispatchers.IO) { api().patrolLogout(s.getString("id")) }; store.clearSession(); prefs.guardName = ""; prefs.lastFixAt = 0L; withContext(Dispatchers.IO) { zw.co.crisis.security.service.SyncEngine(this@PatrolActivity).refreshConfig() }; "Session ended. Next guard can sign in." } }
        }
        if(recent.isNotEmpty()) label("RECENT SCANS",12f)
        recent.drop(1).forEach { label("${it.checkpointName} · ${PatrolMessages.result(it.state, it.decision, it.localDecision)}",12f) }
        button("Emergency / SOS") { AlertFlow.confirmEmergency(this, AlertFlow.Feedback { text, _ -> render(text) }) }
        button("Help & messages") { startActivity(Intent(this, AlertsActivity::class.java)) }
        button("Me") { startActivity(Intent(this, MeActivity::class.java)) }
        button("Phone settings") { startActivity(Intent(this, SettingsActivity::class.java)) }
        if(zw.co.crisis.security.util.DeviceInfo.locationPermission(this) == "denied") button("Enable precise location") { startActivity(Intent(this, PermissionsActivity::class.java)) }
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
            val distanceM = if (fix != null) FloatArray(1).also { android.location.Location.distanceBetween(fix.latitude, fix.longitude, a.optDouble("latitude"), a.optDouble("longitude"), it) }[0].toInt() else -1
            val outcome = ScanOutcome.of(receipt?.decision, localDecision)
            startActivity(Intent(this@PatrolActivity, ScanResultActivity::class.java)
                .putExtra(ScanResultActivity.EXTRA_OUTCOME, outcome.name)
                .putExtra(ScanResultActivity.EXTRA_CHECKPOINT, a.getString("checkpointName"))
                .putExtra(ScanResultActivity.EXTRA_TIME, localTime(GatewayEvent.iso(now)))
                .putExtra(ScanResultActivity.EXTRA_MESSAGE, if (outcome == ScanOutcome.VERIFIED) null else PatrolMessages.result(receipt?.state ?: "RECEIVED", receipt?.decision, localDecision))
                .putExtra(ScanResultActivity.EXTRA_DISTANCE_M, distanceM)
                .putExtra(ScanResultActivity.EXTRA_RADIUS_M, a.optInt("radiusM", -1))
                .putExtra(ScanResultActivity.EXTRA_ACCURACY_M, fix?.accuracy?.toInt() ?: -1))
            if(receipt?.decision == "ACCEPTED") "Checkpoint verified ✓" else if(localDecision != "LOCAL_MATCH") PatrolMessages.result("RECEIVED",localDecision) else "Scan saved · awaiting confirmation"
        }
    }
}
