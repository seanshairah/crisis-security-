package zw.co.crisis.security.ui

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import org.json.JSONObject
import zw.co.crisis.security.R
import zw.co.crisis.security.patrol.GateForm
import zw.co.crisis.security.patrol.GateTracks
import zw.co.crisis.security.ui.Ui.MATCH
import zw.co.crisis.security.ui.Ui.WRAP
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Gate Inventory (handoff v4): four short steps (who and where, vehicle and items, review, result) plus the gate home.
 * Drawn from plain models so snapshot tests render exactly what ships. Nothing here reads storage or the network.
 */
object GateScreens {
    data class Row(val title: String, val subtitle: String, val tracks: List<GateTracks.Track>)
    data class Home(val site: String, val signedIn: Boolean, val message: String?, val saved: List<Row>, val items: List<Row>)

    interface HomeActions { fun record(direction: String) {}; fun scan() {}; fun find(query: String) {}; fun refresh() {}; fun open(index: Int) {}; fun back() {} }
    interface WhereActions { fun back() {}; fun direction(d: String) {}; fun gate() {}; fun category(c: String) {}; fun time() {}; fun next() {} }
    interface ItemsActions { fun back() {}; fun vehicle(v: String) {}; fun unit(i: Int) {}; fun add() {}; fun remove(i: Int) {}; fun next() {} }
    interface ReviewActions { fun edit() {}; fun decision(d: String) {}; fun reason(r: String) {}; fun save() {} }

    private fun dp(c: Context, v: Number) = Ui.dp(c, v)
    private fun page(c: Context) = Ui.column(c).apply { setPadding(dp(c, 22), dp(c, 16), dp(c, 22), dp(c, 28)) }
    private fun time(ms: Long): String {
        val day = SimpleDateFormat("yyyyMMdd", Locale.getDefault())
        val today = day.format(Date()) == day.format(Date(ms))
        return SimpleDateFormat(if (today) "'Today,' HH:mm" else "d MMM, HH:mm", Locale.getDefault()).format(Date(ms))
    }
    private fun tint(t: GateTracks.Tone) = when (t) { GateTracks.Tone.OK -> R.color.ok; GateTracks.Tone.WAIT -> R.color.warn; GateTracks.Tone.WARN -> R.color.warn; GateTracks.Tone.CRITICAL -> R.color.critical; GateTracks.Tone.IDLE -> R.color.ink2 }
    private fun softOf(t: GateTracks.Tone) = when (t) { GateTracks.Tone.OK -> R.color.ok_soft; GateTracks.Tone.CRITICAL -> R.color.critical_soft; GateTracks.Tone.IDLE -> R.color.chip; else -> R.color.warn_soft }

    private fun header(c: Context, col: LinearLayout, back: String, onBack: () -> Unit, title: String, sub: String?, step: Int?) {
        col.addView(GuardScreens.backRow(c, back, onBack))
        col.addView(Ui.title(c, title, 34f), Ui.lp(MATCH, WRAP, dp(c, 6)))
        if (sub != null) col.addView(Ui.text(c, sub, 13f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(c, 4)))
        if (step != null) col.addView(Ui.row(c, 6).apply {
            for (i in 1..3) addView(View(c).apply { background = Ui.round(c, c.getColor(if (i <= step) R.color.accent else R.color.chip), 2) }, LinearLayout.LayoutParams(0, MATCH, 1f))
        }, Ui.lp(MATCH, dp(c, 4), dp(c, 14)))
    }

    private fun label(c: Context, text: String, note: String? = null) = Ui.row(c, 4).apply {
        addView(Ui.text(c, text, 12f, R.color.ink2)); if (note != null) addView(Ui.text(c, "· $note", 12f, R.color.accent))
    }

    private fun errorLine(c: Context, col: LinearLayout, message: String?) {
        if (message != null) col.addView(Ui.text(c, message, 12f, R.color.critical, 500), Ui.lp(MATCH, WRAP, dp(c, 4)))
    }

    private fun field(c: Context, col: LinearLayout, title: String, value: String, hint: String, error: String?, note: String? = null, type: Int = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES, onChange: (String) -> Unit): EditText {
        col.addView(label(c, title, note), Ui.lp(MATCH, WRAP, dp(c, 12)))
        val edit = EditText(c).apply {
            setText(value); this.hint = hint; inputType = type; textSize = 15f; setTextColor(c.getColor(R.color.ink)); setHintTextColor(c.getColor(R.color.ink3))
            typeface = Ui.font(c, 400); includeFontPadding = false; setPadding(dp(c, 14), 0, dp(c, 14), 0); minimumHeight = dp(c, 48)
            background = Ui.round(c, c.getColor(R.color.surface), 14, c.getColor(if (error != null) R.color.critical else R.color.line))
            contentDescription = title
            addTextChangedListener(object : TextWatcher {
                override fun afterTextChanged(s: Editable?) { onChange(s?.toString() ?: "") }
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, d: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, d: Int) {}
            })
        }
        col.addView(edit, Ui.lp(MATCH, dp(c, 48), dp(c, 5)))
        errorLine(c, col, error)
        return edit
    }

    private fun chips(c: Context, col: LinearLayout, options: List<Pair<String, String>>, selected: String, onPick: (String) -> Unit) {
        col.addView(Ui.row(c, 8).apply {
            options.forEach { (key, text) ->
                val on = key == selected
                addView(Ui.text(c, text, 14f, if (on) R.color.accent else R.color.ink, if (on) 600 else 400).apply {
                    gravity = Gravity.CENTER; background = Ui.round(c, c.getColor(if (on) R.color.accent_soft else R.color.surface), 14, c.getColor(if (on) R.color.accent else R.color.line))
                    isClickable = true; isFocusable = true; contentDescription = text + if (on) ", selected" else ""; setOnClickListener { onPick(key) }
                }, LinearLayout.LayoutParams(0, dp(c, 46), 1f))
            }
        }, Ui.lp(MATCH, dp(c, 46), dp(c, 5)))
    }

    private fun select(c: Context, value: String, error: Boolean = false, onClick: () -> Unit) = Ui.row(c, 8).apply {
        background = Ui.round(c, c.getColor(R.color.surface), 14, c.getColor(if (error) R.color.critical else R.color.line)); setPadding(dp(c, 14), 0, dp(c, 10), 0)
        addView(Ui.text(c, value, 15f), LinearLayout.LayoutParams(0, WRAP, 1f))
        addView(Ui.icon(c, R.drawable.ms_chevron_right, 22, R.color.ink2).apply { rotation = 90f })
        isClickable = true; isFocusable = true; contentDescription = value; setOnClickListener { onClick() }
    }

    private fun cta(c: Context, text: String, icon: Int?, onClick: () -> Unit) = HomeView.primaryButton(c, icon, text, onClick).apply { minimumHeight = dp(c, 52) }

    private fun card(c: Context) = Ui.column(c).apply { background = Ui.round(c, c.getColor(R.color.surface), 20, c.getColor(R.color.line)); setPadding(dp(c, 14), dp(c, 14), dp(c, 14), dp(c, 14)) }

    // ── Gate home ──────────────────────────────────────────────────────────────────────────────
    fun home(c: Context, m: Home, a: HomeActions): View {
        val col = page(c)
        header(c, col, "Patrol", { a.back() }, "Gate Inventory", if (m.signedIn) "${m.site} · On duty" else "Sign in for your shift first", null)
        if (!m.signedIn) {
            col.addView(Ui.text(c, "Open Home and sign in to record or check a movement.", 15f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(c, 20)))
            return col
        }
        if (m.message != null) col.addView(Ui.text(c, m.message, 13f, R.color.warn_text).apply { background = Ui.round(c, c.getColor(R.color.warn_soft), 14, c.getColor(R.color.warn_line)); setPadding(dp(c, 14), dp(c, 10), dp(c, 14), dp(c, 10)) }, Ui.lp(MATCH, WRAP, dp(c, 12)))
        col.addView(cta(c, "Record arrival", R.drawable.ms_arrow_forward) { a.record("ARRIVAL") }, Ui.lp(MATCH, dp(c, 56), dp(c, 16)))
        col.addView(HomeView.secondaryButton(c, null, "Record departure") { a.record("DEPARTURE") }.apply { minimumHeight = dp(c, 52) }, Ui.lp(MATCH, dp(c, 52), dp(c, 10)))
        col.addView(Ui.row(c, 10).apply {
            addView(HomeView.secondaryButton(c, R.drawable.ms_qr_code_scanner, "Scan code") { a.scan() }.apply { minimumHeight = dp(c, 48) }, LinearLayout.LayoutParams(0, dp(c, 48), 1f))
            addView(HomeView.secondaryButton(c, R.drawable.ms_sync, "Refresh") { a.refresh() }.apply { minimumHeight = dp(c, 48) }, LinearLayout.LayoutParams(0, dp(c, 48), 1f))
        }, Ui.lp(MATCH, dp(c, 48), dp(c, 10)))
        lateinit var query: EditText
        col.addView(Ui.row(c, 8).apply {
            background = Ui.round(c, c.getColor(R.color.surface), 14, c.getColor(R.color.line)); setPadding(dp(c, 14), 0, dp(c, 6), 0)
            addView(Ui.icon(c, R.drawable.ms_search, 20, R.color.ink2))
            query = EditText(c).apply {
                hint = "Find by reference or registration"; textSize = 14f; setTextColor(c.getColor(R.color.ink)); setHintTextColor(c.getColor(R.color.ink3)); background = null; maxLines = 1; inputType = InputType.TYPE_CLASS_TEXT
                imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH
                setOnEditorActionListener { v, _, _ -> a.find(v.text.toString().trim()); true }
            }
            addView(query, LinearLayout.LayoutParams(0, MATCH, 1f))
            addView(Ui.text(c, "Find", 14f, R.color.accent, 700).apply { setPadding(dp(c, 12), dp(c, 12), dp(c, 12), dp(c, 12)); isClickable = true; setOnClickListener { a.find(query.text.toString().trim()) } })
        }, Ui.lp(MATCH, dp(c, 48), dp(c, 14)))
        if (m.saved.isNotEmpty()) {
            col.addView(Ui.text(c, "Saved on this phone", 13f, R.color.ink2, 600), Ui.lp(MATCH, WRAP, dp(c, 20)))
            m.saved.forEach { r -> col.addView(rowCard(c, r) {}, Ui.lp(MATCH, WRAP, dp(c, 8))) }
        }
        col.addView(Ui.text(c, if (m.items.isEmpty()) "Nothing waiting for a check" else "Waiting for a check", 13f, R.color.ink2, 600), Ui.lp(MATCH, WRAP, dp(c, 20)))
        m.items.forEachIndexed { i, r -> col.addView(rowCard(c, r) { a.open(i) }, Ui.lp(MATCH, WRAP, dp(c, 8))) }
        return col
    }

    private fun rowCard(c: Context, r: Row, onClick: () -> Unit) = card(c).apply {
        addView(Ui.text(c, r.title, 15f, R.color.ink, 600)); if (r.subtitle.isNotBlank()) addView(Ui.text(c, r.subtitle, 13f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(c, 2)))
        addView(Ui.row(c, 6).apply { r.tracks.forEach { t -> addView(miniChip(c, t)) } }, Ui.lp(MATCH, WRAP, dp(c, 10)))
        isClickable = true; isFocusable = true; contentDescription = r.title; setOnClickListener { onClick() }
    }

    private fun miniChip(c: Context, t: GateTracks.Track) = Ui.text(c, t.chip, 11f, tint(t.tone), 700).apply { background = Ui.round(c, c.getColor(softOf(t.tone)), 10); setPadding(dp(c, 8), dp(c, 4), dp(c, 8), dp(c, 4)); contentDescription = "${t.title}: ${t.value}" }

    // ── Step 1: where and who ─────────────────────────────────────────────────────────────────
    fun stepWhere(c: Context, f: GateForm, site: String, gateName: String, errors: Map<String, String>, a: WhereActions): View {
        val col = page(c)
        header(c, col, "Gate Inventory", { a.back() }, if (f.arrival) "Record arrival" else "Record departure", "$site · On duty", 1)
        col.addView(Ui.row(c, 0).apply {
            background = Ui.round(c, c.getColor(R.color.surface), 16, c.getColor(R.color.line)); setPadding(dp(c, 4), dp(c, 4), dp(c, 4), dp(c, 4))
            listOf("ARRIVAL" to "Arrival", "DEPARTURE" to "Departure").forEach { (k, t) ->
                val on = f.direction == k
                addView(Ui.text(c, t, 14f, if (on) R.color.on_accent else R.color.ink2, if (on) 700 else 400).apply {
                    gravity = Gravity.CENTER; background = if (on) Ui.round(c, c.getColor(R.color.accent), 12) else null
                    isClickable = true; isFocusable = true; contentDescription = t + if (on) ", selected" else ""; setOnClickListener { a.direction(k) }
                }, LinearLayout.LayoutParams(0, dp(c, 40), 1f))
            }
        }, Ui.lp(MATCH, WRAP, dp(c, 14)))
        col.addView(label(c, "Gate / checkpoint"), Ui.lp(MATCH, WRAP, dp(c, 12)))
        col.addView(select(c, gateName.ifBlank { "Choose the gate" }, errors.containsKey("checkpoint")) { a.gate() }, Ui.lp(MATCH, dp(c, 48), dp(c, 5)))
        errorLine(c, col, errors["checkpoint"])
        col.addView(label(c, "Inventory category"), Ui.lp(MATCH, WRAP, dp(c, 12)))
        chips(c, col, GateForm.CATEGORIES, f.category) { a.category(it) }
        field(c, col, f.partyLabel, f.party, if (f.arrival) "Who is delivering?" else "Who is taking it?", errors["party"]) { f.party = it }
        field(c, col, f.placeLabel, f.place, if (f.arrival) "Where is it coming from?" else "Where is it going?", errors["place"]) { f.place = it }
        col.addView(Ui.row(c, 12).apply {
            background = Ui.round(c, c.getColor(R.color.surface), 14, c.getColor(if (errors.containsKey("time")) R.color.critical else R.color.line)); setPadding(dp(c, 14), dp(c, 10), dp(c, 14), dp(c, 10))
            addView(Ui.icon(c, R.drawable.ms_schedule, 22, R.color.ink2))
            addView(Ui.column(c).apply { addView(Ui.text(c, "Actual movement time", 11f, R.color.ink2)); addView(Ui.text(c, time(f.occurredAt), 14.5f), Ui.lp(MATCH, WRAP, dp(c, 2))) }, LinearLayout.LayoutParams(0, WRAP, 1f))
            addView(Ui.text(c, "Change", 13.5f, R.color.accent, 600))
            isClickable = true; isFocusable = true; contentDescription = "Change movement time"; setOnClickListener { a.time() }
        }, Ui.lp(MATCH, WRAP, dp(c, 12)))
        errorLine(c, col, errors["time"])
        col.addView(cta(c, "Next · Vehicle and items", R.drawable.ms_arrow_forward) { a.next() }, Ui.lp(MATCH, dp(c, 52), dp(c, 20)))
        return col
    }

    // ── Step 2: vehicle and items ─────────────────────────────────────────────────────────────
    fun stepItems(c: Context, f: GateForm, errors: Map<String, String>, a: ItemsActions): View {
        val col = page(c)
        header(c, col, "Back", { a.back() }, "Vehicle and items", null, 2)
        col.addView(label(c, "Vehicle", "None for a person on foot"), Ui.lp(MATCH, WRAP, dp(c, 14)))
        chips(c, col, GateForm.VEHICLES, f.vehicle) { a.vehicle(it) }
        if (f.vehicle != "NONE") field(c, col, "Registration", f.registration, "e.g. AFN 4821", errors["registration"], "required with a vehicle", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS) { f.registration = it }
        field(c, col, "Delivery note reference", f.deliveryNote, "e.g. DN-20418", null, "optional") { f.deliveryNote = it }
        f.items.forEachIndexed { i, item ->
            col.addView(Ui.column(c).apply {
                background = Ui.round(c, c.getColor(R.color.surface), 20, c.getColor(R.color.line)); setPadding(dp(c, 14), dp(c, 12), dp(c, 14), dp(c, 14))
                addView(Ui.row(c, 8).apply {
                    addView(Ui.text(c, "Item ${i + 1}", 13f, R.color.ink2, 600), LinearLayout.LayoutParams(0, WRAP, 1f))
                    if (f.items.size > 1) addView(Ui.icon(c, R.drawable.ms_delete, 22, R.color.critical).apply { isClickable = true; contentDescription = "Remove item ${i + 1}"; setPadding(dp(c, 6), dp(c, 6), dp(c, 6), dp(c, 6)); setOnClickListener { a.remove(i) } })
                })
                field(c, this, "Product", item.name, "e.g. Maize, white", errors["name$i"]) { item.name = it }
                addView(Ui.row(c, 10, Gravity.TOP).apply {
                    val q = Ui.column(c); field(c, q, "Quantity", item.quantity, "0", errors["quantity$i"], null, InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL) { item.quantity = it }
                    val u = Ui.column(c); u.addView(label(c, "Unit"), Ui.lp(MATCH, WRAP, dp(c, 12))); u.addView(select(c, item.unit.ifBlank { "Choose" }, errors.containsKey("unit$i")) { a.unit(i) }, Ui.lp(MATCH, dp(c, 48), dp(c, 5))); errorLine(c, u, errors["unit$i"])
                    addView(q, LinearLayout.LayoutParams(0, WRAP, 1f)); addView(u, LinearLayout.LayoutParams(0, WRAP, 1f))
                })
                field(c, this, "Description", item.description, "Describe the goods", errors["description$i"], if (f.category == "OTHER") "required for Other" else null) { item.description = it }
            }, Ui.lp(MATCH, WRAP, dp(c, 14)))
        }
        if (f.items.size < 40) col.addView(HomeView.secondaryButton(c, R.drawable.ms_add, "Add another item") { a.add() }.apply { minimumHeight = dp(c, 48) }, Ui.lp(MATCH, dp(c, 48), dp(c, 12)))
        col.addView(cta(c, "Review", R.drawable.ms_arrow_forward) { a.next() }, Ui.lp(MATCH, dp(c, 52), dp(c, 14)))
        return col
    }

    // ── Step 3: review against the goods ──────────────────────────────────────────────────────
    private fun summaryRow(c: Context, k: String, v: String) = Ui.row(c, 10, Gravity.TOP).apply {
        addView(Ui.text(c, k, 13f, R.color.ink2), LinearLayout.LayoutParams(dp(c, 96), WRAP)); addView(Ui.text(c, v, 14.5f, R.color.ink, 500), LinearLayout.LayoutParams(0, WRAP, 1f))
    }

    fun review(c: Context, f: GateForm, gateName: String, expected: JSONObject?, decision: String, reason: String, errors: Map<String, String>, a: ReviewActions): View {
        val col = page(c)
        header(c, col, "Edit", { a.edit() }, "Check the goods", "Compare this with what is physically at the gate.", 3)
        col.addView(card(c).apply {
            addView(summaryRow(c, if (f.arrival) "Arrival at" else "Departure from", gateName))
            addView(summaryRow(c, if (f.arrival) "Supplier" else "Taking goods", f.party), Ui.lp(MATCH, WRAP, dp(c, 8)))
            addView(summaryRow(c, f.placeLabel, f.place), Ui.lp(MATCH, WRAP, dp(c, 8)))
            addView(summaryRow(c, "Vehicle", if (f.vehicle == "NONE") "On foot" else "${GateForm.VEHICLES.first { it.first == f.vehicle }.second} · ${f.registration}"), Ui.lp(MATCH, WRAP, dp(c, 8)))
            addView(summaryRow(c, "Movement time", time(f.occurredAt)), Ui.lp(MATCH, WRAP, dp(c, 8)))
            if (f.deliveryNote.isNotBlank()) addView(summaryRow(c, "Delivery note", f.deliveryNote), Ui.lp(MATCH, WRAP, dp(c, 8)))
        }, Ui.lp(MATCH, WRAP, dp(c, 14)))
        f.items.forEachIndexed { i, it ->
            col.addView(Ui.row(c, 12).apply {
                background = Ui.round(c, c.getColor(R.color.surface), 18, c.getColor(R.color.line)); setPadding(dp(c, 14), dp(c, 12), dp(c, 14), dp(c, 12))
                addView(Ui.icon(c, R.drawable.ms_grain, 24, R.color.accent))
                addView(Ui.column(c).apply { addView(Ui.text(c, it.name, 14.5f, R.color.ink, 600)); addView(Ui.text(c, "Item ${i + 1} of ${f.items.size}" + if (it.description.isNotBlank()) " · ${it.description}" else "", 12f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(c, 2))) }, LinearLayout.LayoutParams(0, WRAP, 1f))
                addView(Ui.column(c).apply { gravity = Gravity.END; addView(Ui.text(c, it.quantity.trim(), 20f, R.color.ink, 700)); addView(Ui.text(c, it.unit, 12f, R.color.ink2)) })
            }, Ui.lp(MATCH, WRAP, dp(c, 10)))
        }
        val diffs = f.differencesFrom(expected)
        if (expected != null) {
            col.addView(Ui.text(c, if (diffs.isEmpty()) "Matches what the inventory system announced." else "Differs from the announcement: ${diffs.joinToString(", ")}. A supervisor will decide.", 13f, if (diffs.isEmpty()) R.color.ok_text else R.color.warn_text).apply {
                background = Ui.round(c, c.getColor(if (diffs.isEmpty()) R.color.ok_soft else R.color.warn_soft), 14, c.getColor(if (diffs.isEmpty()) R.color.ok_line else R.color.warn_line)); setPadding(dp(c, 14), dp(c, 10), dp(c, 14), dp(c, 10))
            }, Ui.lp(MATCH, WRAP, dp(c, 12)))
            col.addView(label(c, "Your decision"), Ui.lp(MATCH, WRAP, dp(c, 12)))
            chips(c, col, listOf("APPROVE" to "Goods match", "REJECT" to "Reject"), decision) { a.decision(it) }
            if (diffs.isNotEmpty() || decision != "APPROVE") field(c, col, "Reason", reason, "What is different, or why reject?", errors["reason"], "required") { a.reason(it) }
        }
        col.addView(Ui.row(c, 12).apply {
            background = Ui.round(c, c.getColor(R.color.info_soft), 14); setPadding(dp(c, 14), dp(c, 12), dp(c, 14), dp(c, 12))
            addView(Ui.icon(c, R.drawable.ms_info, 22, R.color.info))
            addView(Ui.text(c, "Saving records your check. A supervisor still decides unless site rules let you approve. If the count differs, go back, change it and add a reason.", 12.5f, R.color.ink2), LinearLayout.LayoutParams(0, WRAP, 1f))
        }, Ui.lp(MATCH, WRAP, dp(c, 12)))
        col.addView(cta(c, "Goods checked · Save", R.drawable.ms_task_alt) { a.save() }, Ui.lp(MATCH, dp(c, 52), dp(c, 16)))
        return col
    }

    // ── Step 4: result ────────────────────────────────────────────────────────────────────────
    fun result(c: Context, headline: String, body: String, tracks: List<GateTracks.Track>, advice: String, onView: () -> Unit, onDone: () -> Unit): View {
        val col = page(c)
        val tone = tracks[0].tone
        val from = when (tone) { GateTracks.Tone.OK -> 0xFF7FD17A.toInt(); GateTracks.Tone.CRITICAL -> 0xFFE5452F.toInt(); else -> 0xFFF0B24A.toInt() }
        val to = when (tone) { GateTracks.Tone.OK -> 0xFF2F7A37.toInt(); GateTracks.Tone.CRITICAL -> 0xFF9C1F12.toInt(); else -> 0xFFA8720F.toInt() }
        col.addView(FrameLayout(c).apply {
            addView(View(c).apply { background = Ui.oval((from and 0x00FFFFFF) or (0x22 shl 24)) }, FrameLayout.LayoutParams(dp(c, 132), dp(c, 132), Gravity.CENTER))
            addView(FrameLayout(c).apply {
                background = GradientDrawable(GradientDrawable.Orientation.TL_BR, intArrayOf(from, to)).apply { shape = GradientDrawable.OVAL }
                addView(Ui.icon(c, if (tone == GateTracks.Tone.OK) R.drawable.ms_check else R.drawable.ms_save, 44, R.color.ink).apply { imageTintList = android.content.res.ColorStateList.valueOf(if (tone == GateTracks.Tone.CRITICAL) 0xFFFFFFFF.toInt() else 0xFF1A1008.toInt()) }.also { Ui.center(it) })
            }, FrameLayout.LayoutParams(dp(c, 88), dp(c, 88), Gravity.CENTER))
        }, Ui.lp(MATCH, dp(c, 132), dp(c, 24)))
        col.addView(Ui.title(c, headline, 34f).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(c, 12)))
        col.addView(Ui.text(c, body, 14.5f, R.color.ink2).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(c, 8)))
        col.addView(tracksCard(c, tracks), Ui.lp(MATCH, WRAP, dp(c, 20)))
        col.addView(Ui.text(c, advice, 13f, R.color.ink2).apply { gravity = Gravity.CENTER }, Ui.lp(MATCH, WRAP, dp(c, 14)))
        col.addView(cta(c, "Done", null) { onDone() }, Ui.lp(MATCH, dp(c, 52), dp(c, 20)))
        col.addView(HomeView.secondaryButton(c, null, "View record") { onView() }.apply { minimumHeight = dp(c, 48) }, Ui.lp(MATCH, dp(c, 48), dp(c, 10)))
        return col
    }

    /** The three independent tracks as three rows: device, gate approval, inventory system. */
    fun tracksCard(c: Context, tracks: List<GateTracks.Track>) = card(c).apply {
        val icons = listOf(R.drawable.ms_mobile, R.drawable.ms_gavel, R.drawable.ms_sync_alt)
        tracks.forEachIndexed { i, t ->
            addView(Ui.row(c, 12).apply {
                addView(Ui.icon(c, icons[i], 22, R.color.ink2))
                addView(Ui.column(c).apply { addView(Ui.text(c, t.title, 12f, R.color.ink2)); addView(Ui.text(c, t.value, 14.5f, R.color.ink, 600), Ui.lp(MATCH, WRAP, dp(c, 2))) }, LinearLayout.LayoutParams(0, WRAP, 1f))
                addView(miniChip(c, t))
            }, Ui.lp(MATCH, WRAP, if (i == 0) 0 else dp(c, 14)))
        }
    }

    /** A movement the server holds: what was announced, what was seen, and where it stands. */
    fun movement(c: Context, title: String, expected: String?, observed: String?, tracks: List<GateTracks.Track>, canCheck: Boolean, onCheck: () -> Unit, onBack: () -> Unit): View {
        val col = page(c)
        header(c, col, "Gate Inventory", onBack, title, null, null)
        col.addView(tracksCard(c, tracks), Ui.lp(MATCH, WRAP, dp(c, 14)))
        if (expected != null) col.addView(card(c).apply { addView(Ui.text(c, "Announced", 12f, R.color.ink2, 600)); addView(Ui.text(c, expected, 14f), Ui.lp(MATCH, WRAP, dp(c, 6))) }, Ui.lp(MATCH, WRAP, dp(c, 12)))
        if (observed != null) col.addView(card(c).apply { addView(Ui.text(c, "Checked at the gate", 12f, R.color.ink2, 600)); addView(Ui.text(c, observed, 14f), Ui.lp(MATCH, WRAP, dp(c, 6))) }, Ui.lp(MATCH, WRAP, dp(c, 12)))
        if (canCheck) col.addView(cta(c, "Record physical check", R.drawable.ms_arrow_forward) { onCheck() }, Ui.lp(MATCH, dp(c, 52), dp(c, 18)))
        else col.addView(Ui.text(c, "This movement has already been checked. Operations can review its decision and delivery.", 13f, R.color.ink2), Ui.lp(MATCH, WRAP, dp(c, 16)))
        return col
    }
}
