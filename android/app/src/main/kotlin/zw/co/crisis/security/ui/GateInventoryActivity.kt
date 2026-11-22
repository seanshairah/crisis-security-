package zw.co.crisis.security.ui

import android.os.Bundle
import android.view.View
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import zw.co.crisis.security.data.Prefs
import zw.co.crisis.security.net.ApiClient
import zw.co.crisis.security.patrol.GateForm
import zw.co.crisis.security.patrol.GateRuntime
import zw.co.crisis.security.patrol.GateTracks
import zw.co.crisis.security.patrol.PatrolStore
import java.util.Calendar
import java.util.UUID

/**
 * Gate Inventory (handoff v4): home, then four short steps. A save is kept in the phone's ledger first and sent when
 * there is signal; the result screen keeps device, gate approval and inventory sync apart and never calls a local save approved.
 */
class GateInventoryActivity : AppCompatActivity() {
    private enum class Step { HOME, WHERE, ITEMS, REVIEW, RESULT, MOVEMENT }

    private lateinit var store: PatrolStore
    private lateinit var prefs: Prefs
    private var data = JSONObject()
    private var step = Step.HOME
    private var busy = false
    private var message: String? = null
    private var form: GateForm? = null
    private var movement: JSONObject? = null
    private var decision = "APPROVE"
    private var reason = ""
    private var errors: Map<String, String> = emptyMap()
    private var resultCommand = ""
    private val scanner = registerForActivityResult(ScanContract()) { r -> r.contents?.let { lookup(it) } }

    private fun api() = ApiClient(prefs.serverUrl, prefs.deviceToken)
    private fun session() = store.config()?.optJSONObject("session")?.takeIf { System.currentTimeMillis() < PatrolStore.time(it.getString("expiresAt")) }
    private fun sessionId() = session()?.optString("id") ?: ""
    private fun site() = session()?.optString("siteName").orEmpty().ifBlank { "Your site" }
    private fun checkpoints(): List<Pair<String, String>> = data.optJSONArray("checkpoints")?.let { a -> (0 until a.length()).map { a.getJSONObject(it).let { o -> o.getString("id") to o.getString("name") } } } ?: emptyList()
    private fun gateName(id: String) = checkpoints().firstOrNull { it.first == id }?.second.orEmpty()
    private fun draftKey(f: GateForm) = "gate-draft:${sessionId()}:${movement?.optString("id").takeUnless { it.isNullOrBlank() } ?: f.direction}"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = PatrolStore.get(this); prefs = Prefs(this)
        data = store.meta("gate-cache:${sessionId()}")?.let { JSONObject(it) } ?: JSONObject()
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                errors = emptyMap()
                when (step) {
                    Step.ITEMS -> go(Step.WHERE)
                    Step.REVIEW -> go(Step.ITEMS)
                    Step.WHERE, Step.RESULT, Step.MOVEMENT -> { saveDraft(); form = null; movement = null; go(Step.HOME) }
                    Step.HOME -> finish()
                }
            }
        })
        go(Step.HOME)
        if (session() != null) lookup("")
    }

    override fun onPause() { saveDraft(); super.onPause() }

    private fun saveDraft() {
        val f = form ?: return
        if (step == Step.HOME || step == Step.RESULT || step == Step.MOVEMENT) return
        store.setMeta(draftKey(f), JSONObject().put("details", f.toDetails()).put("checkpointId", f.checkpointId).toString())
    }

    private fun go(next: Step) { step = next; render() }

    private fun render() {
        val view: View = when (step) {
            Step.HOME -> GateScreens.home(this, home(), object : GateScreens.HomeActions {
                override fun back() { finish() }
                override fun record(direction: String) { if (!busy) start(direction, null) }
                override fun scan() { scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Scan the gate or movement code").setBeepEnabled(true)) }
                override fun find(query: String) { lookup(query) }
                override fun refresh() { lookup("") }
                override fun open(index: Int) { items().getOrNull(index)?.let { movement = it; go(Step.MOVEMENT) } }
            })
            Step.WHERE -> run { val g = form!!; GateScreens.stepWhere(this, g, site(), gateName(g.checkpointId), errors, object : GateScreens.WhereActions {
                override fun back() { saveDraft(); form = null; movement = null; errors = emptyMap(); go(Step.HOME) }
                override fun direction(d: String) { if (movement == null) { g.direction = d; errors = emptyMap(); render() } }
                override fun gate() { pickGate(g) }
                override fun category(c: String) { g.category = c; render() }
                override fun time() { pickTime(g) }
                override fun next() { errors = g.problemsStep1(); if (errors.isEmpty()) go(Step.ITEMS) else render() }
            }) }
            Step.ITEMS -> run { val g = form!!; GateScreens.stepItems(this, g, errors, object : GateScreens.ItemsActions {
                override fun back() { errors = emptyMap(); go(Step.WHERE) }
                override fun vehicle(v: String) { g.vehicle = v; render() }
                override fun unit(i: Int) { pickUnit(g, i) }
                override fun add() { if (g.items.size < 40) { g.items += zw.co.crisis.security.patrol.GateItem(); render() } }
                override fun remove(i: Int) { if (g.items.size > 1) { g.items.removeAt(i); errors = emptyMap(); render() } }
                override fun next() { errors = g.problemsStep2(); if (errors.isEmpty()) { saveDraft(); go(Step.REVIEW) } else render() }
            }) }
            Step.REVIEW -> run { val g = form!!; GateScreens.review(this, g, gateName(g.checkpointId), movement?.optJSONObject("expected"), decision, reason, errors, object : GateScreens.ReviewActions {
                override fun edit() { errors = emptyMap(); go(Step.ITEMS) }
                override fun decision(d: String) { decision = d; render() }
                override fun reason(r: String) { reason = r }
                override fun save() { confirm(g) }
            }) }
            Step.RESULT -> resultView()
            Step.MOVEMENT -> movementView()
        }
        GuardChrome.install(this, view, GuardChrome.Tab.PATROL)
    }

    // ── Home ──────────────────────────────────────────────────────────────────────────────────
    private fun items(): List<JSONObject> = data.optJSONArray("items")?.let { a -> (0 until a.length()).map { a.getJSONObject(it) } } ?: emptyList()

    private fun home(): GateScreens.Home {
        val sid = sessionId()
        val saved = if (sid.isBlank()) emptyList() else store.gateSaved(sid).map { s ->
            GateScreens.Row("${if (s.direction == "ARRIVAL") "Arrival" else "Departure"} · ${s.command.optJSONObject("details")?.optString("party").orEmpty()}", java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(s.createdAt)), tracksFor(s.state, s.result))
        }
        val rows = items().map { m ->
            val d = m.optJSONObject("expected") ?: m.optJSONObject("observed")
            GateScreens.Row("${if (m.optString("direction") == "ARRIVAL") "Arrival" else "Departure"} · ${m.optString("sourceReference").removePrefix("external:")}", listOfNotNull(d?.optString("party"), d?.optString("registration")?.takeIf { it.isNotBlank() }).joinToString(" · "), GateTracks.forMovement(m))
        }
        return GateScreens.Home(site(), sid.isNotBlank(), message, saved, rows)
    }

    private fun tracksFor(state: String, result: String?): List<GateTracks.Track> {
        if (state == "SENT" && result != null) runCatching { return GateTracks.forMovement(JSONObject(result)) }
        return GateTracks.forLocal(state)
    }

    private fun lookup(q: String) {
        if (busy || session() == null) return
        busy = true
        message = "Connecting to operations… Saved records stay on this phone."
        if (step == Step.HOME) render()
        lifecycleScope.launch {
            try {
                val r = withContext(Dispatchers.IO) { GateRuntime(this@GateInventoryActivity).sync(api()); api().gateList(sessionId(), q) }
                data = r
                if (q.isBlank() || q.startsWith("CS2|")) store.setMeta("gate-cache:${sessionId()}", r.toString())
                message = if (q.startsWith("CS2|")) "Gate selected. Choose Arrival or Departure, or open a waiting movement." else null
                if (r.optString("checkpointId").isNotBlank()) chosenGate = r.getString("checkpointId")
            } catch (e: Exception) {
                message = if (e is ApiClient.ApiException) e.message ?: "Unable to find movement" else "No signal. Saved records stay on this phone; showing the last downloaded list."
            } finally { busy = false; if (step == Step.HOME) render() }
        }
    }

    private var chosenGate = ""

    // ── Steps ─────────────────────────────────────────────────────────────────────────────────
    private fun start(direction: String, m: JSONObject?) {
        if (session() == null) { render(); return }
        if (checkpoints().isEmpty()) { message = "Connect once to download this site's gates."; render(); return }
        movement = m; errors = emptyMap(); decision = "APPROVE"; reason = ""
        val f = GateForm(direction)
        val key = "gate-draft:${sessionId()}:${m?.optString("id").takeUnless { it.isNullOrBlank() } ?: direction}"
        val draft = store.meta(key)?.let { runCatching { JSONObject(it) }.getOrNull() }
        val details = draft?.optJSONObject("details") ?: m?.optJSONObject("expected")
        form = GateForm.from(details, direction).also { g ->
            g.checkpointId = draft?.optString("checkpointId").orEmpty().ifBlank { chosenGate }
            if (g.checkpointId.isBlank() && checkpoints().size == 1) g.checkpointId = checkpoints()[0].first
            // A draft keeps its own time; an announced movement starts at the moment the guard checks it.
            g.occurredAt = draft?.optJSONObject("details")?.optString("occurredAt")?.let { runCatching { PatrolStore.time(it) }.getOrNull() } ?: System.currentTimeMillis()
        }
        go(Step.WHERE)
    }

    private fun pickGate(f: GateForm) {
        val cps = checkpoints()
        AlertDialog.Builder(this).setTitle("Gate / checkpoint").setItems(cps.map { it.second }.toTypedArray()) { _, i -> f.checkpointId = cps[i].first; chosenGate = f.checkpointId; errors = errors - "checkpoint"; render() }.show()
    }

    private fun pickUnit(f: GateForm, i: Int) {
        AlertDialog.Builder(this).setTitle("Unit").setItems(GateForm.UNITS.toTypedArray()) { _, k -> f.items[i].unit = GateForm.UNITS[k]; errors = errors - "unit$i"; render() }.show()
    }

    private fun pickTime(f: GateForm) {
        val c = Calendar.getInstance().apply { timeInMillis = f.occurredAt }
        android.app.DatePickerDialog(this, { _, y, mo, d ->
            c.set(y, mo, d)
            android.app.TimePickerDialog(this, { _, h, min -> c.set(Calendar.HOUR_OF_DAY, h); c.set(Calendar.MINUTE, min); f.occurredAt = c.timeInMillis; errors = errors - "time"; render() }, c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE), true).show()
        }, c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH)).show()
    }

    /** Keeps the check in the ledger first. It is never shown as approved until the server says so. */
    private fun confirm(f: GateForm) {
        if (sessionId().isBlank()) { message = "Your shift has ended. Sign in again before saving."; form = null; go(Step.HOME); return }
        val m = movement
        val diffs = f.differencesFrom(m?.optJSONObject("expected"))
        val why = reason.trim()
        if (m != null && (decision != "APPROVE" || diffs.isNotEmpty()) && why.isBlank()) { errors = mapOf("reason" to "Explain the rejection or difference"); render(); return }
        val cmd = JSONObject().put("action", if (m == null) "RECORD" else "VERIFY").put("commandId", UUID.randomUUID().toString()).put("sessionId", sessionId())
            .put("checkpointId", f.checkpointId).put("capturedAt", GateForm.iso(System.currentTimeMillis())).put("details", f.toDetails())
        if (m == null) cmd.put("direction", f.direction) else cmd.put("movementId", m.getString("id")).put("version", m.getInt("version")).put("decision", decision).put("reason", why)
        store.gateEnqueue(cmd)
        store.setMeta(draftKey(f), null)
        resultCommand = cmd.getString("commandId")
        errors = emptyMap(); step = Step.RESULT; render()
        lifecycleScope.launch {
            runCatching { withContext(Dispatchers.IO) { GateRuntime(this@GateInventoryActivity).sync(api()) } }
            if (step == Step.RESULT) render()
        }
    }

    private fun resultView(): View {
        val (state, res) = store.gateState(resultCommand) ?: ("QUEUED" to null)
        val tracks = tracksFor(state, res)
        val f = form
        val what = f?.let { "${it.items.sumOf { i -> i.quantity.trim().toDoubleOrNull() ?: 0.0 }.let { q -> if (q == Math.floor(q)) q.toLong().toString() else q.toString() }} ${it.items.firstOrNull()?.unit.orEmpty()} of ${it.items.firstOrNull()?.name.orEmpty().lowercase()}" }.orEmpty()
        val verb = if (f?.arrival == false) "Departure" else "Arrival"
        val (head, body) = when (state) {
            "SENT" -> "Reached operations" to "$verb of $what is with operations. Gate approval is a separate step."
            "ATTENTION" -> "Needs operations" to (res ?: "Operations needs to look at this record.")
            else -> "Saved on this phone" to "$verb of $what is kept safely. It sends when you are back online. Do not record it again."
        }
        return GateScreens.result(this, head, body, tracks, GateTracks.advice(tracks), { form = null; movement = null; go(Step.HOME); lookup("") }, { form = null; movement = null; go(Step.HOME) })
    }

    private fun movementView(): View {
        val m = movement ?: JSONObject()
        val tracks = GateTracks.forMovement(m)
        return GateScreens.movement(this, "${if (m.optString("direction") == "ARRIVAL") "Arrival" else "Departure"} · ${m.optString("sourceReference").removePrefix("external:")}", m.optJSONObject("expected")?.let { summary(it) }, m.optJSONObject("observed")?.let { summary(it) }, tracks,
            m.optString("status") == "PENDING" && m.optJSONObject("observed") == null, { start(m.getString("direction"), m) }, { movement = null; go(Step.HOME) })
    }

    private fun summary(d: JSONObject): String {
        val lines = d.optJSONArray("items") ?: JSONArray()
        return "${d.optString("party")} · ${d.optString("place")}\n${d.optString("vehicleType")} ${d.optString("registration")}".trim() + "\n" +
            (0 until lines.length()).joinToString("\n") { i -> val r = lines.getJSONObject(i); "${r.opt("quantity")} ${r.optString("unit")} · ${r.optString("name")}" }
    }
}
