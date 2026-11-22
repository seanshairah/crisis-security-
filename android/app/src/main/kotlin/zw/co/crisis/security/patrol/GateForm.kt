package zw.co.crisis.security.patrol

import org.json.JSONArray
import org.json.JSONObject

/** One line of goods on the gate form. Quantity stays text while typing and is parsed only when checked. */
data class GateItem(var name: String = "", var description: String = "", var quantity: String = "", var unit: String = "")

/**
 * Everything the guard types for one movement, kept apart from the screens so it can be checked on a plain JVM.
 * It is the single place that decides what counts as complete, mirroring the portal's own contract.
 */
class GateForm(var direction: String = "ARRIVAL", var occurredAt: Long = System.currentTimeMillis()) {
    var checkpointId = ""
    var category = "MAIZE"
    var party = ""
    var place = ""
    var vehicle = "NONE"
    var registration = ""
    var deliveryNote = ""
    var note = ""
    val items = mutableListOf(GateItem())

    val arrival get() = direction == "ARRIVAL"
    val partyLabel get() = if (arrival) "Supplier · person or company delivering" else "Person or company taking the goods"
    val placeLabel get() = if (arrival) "Origin" else "Destination"

    /** Keys are stable ids the screen uses to mark the field; values are the sentence shown to the guard. */
    fun problemsStep1(): Map<String, String> = buildMap {
        if (checkpointId.isBlank()) put("checkpoint", "Choose the gate")
        if (party.isBlank()) put("party", if (arrival) "Enter who is delivering" else "Enter who is taking the goods")
        if (place.isBlank()) put("place", if (arrival) "Enter where it is coming from" else "Enter where it is going")
        if (occurredAt > System.currentTimeMillis() + 60_000) put("time", "The movement time cannot be in the future")
        if (System.currentTimeMillis() - occurredAt > 7 * 86_400_000L) put("time", "Use a movement time from the past seven days")
    }

    fun problemsStep2(): Map<String, String> = buildMap {
        if (vehicle != "NONE" && registration.isBlank()) put("registration", "Enter the vehicle registration")
        items.forEachIndexed { i, it ->
            if (it.name.isBlank()) put("name$i", "Enter the product name")
            val q = it.quantity.trim().toDoubleOrNull()
            if (q == null || q <= 0.0 || q.isInfinite()) put("quantity$i", "Enter a quantity above zero")
            if (it.unit.isBlank()) put("unit$i", "Choose the unit")
        }
        if (category == "OTHER" && items.none { it.description.isNotBlank() }) put("description0", "Describe the goods")
    }

    fun complete() = problemsStep1().isEmpty() && problemsStep2().isEmpty()

    fun toDetails(): JSONObject = JSONObject()
        .put("category", category).put("party", party.trim()).put("place", place.trim())
        .put("occurredAt", iso(occurredAt)).put("vehicleType", vehicle)
        .put("registration", if (vehicle == "NONE") "" else registration.trim())
        .put("deliveryNote", deliveryNote.trim()).put("note", note.trim())
        .put("items", JSONArray().apply {
            items.forEach { put(JSONObject().put("name", it.name.trim()).put("description", it.description.trim()).put("quantity", it.quantity.trim().toDoubleOrNull() ?: 0).put("unit", it.unit.trim())) }
        })

    /** Fields where what the guard saw differs from what the inventory system announced. Empty means they match. */
    fun differencesFrom(expected: JSONObject?): List<String> {
        if (expected == null) return emptyList()
        val mine = toDetails()
        return LABELS.filter { (k, _) -> !GateRules.same(expected.opt(k), mine.opt(k)) }.map { it.second }
    }

    companion object {
        private val LABELS = listOf("category" to "Category", "items" to "Items or counts", "party" to "Supplier or recipient", "place" to "Origin or destination", "vehicleType" to "Vehicle", "registration" to "Registration")
        val UNITS = listOf("bags", "kg", "tonnes", "pieces", "litres", "units")
        val VEHICLES = listOf("NONE" to "None", "TRUCK" to "Truck", "CAR" to "Car", "BIKE" to "Bike")
        val CATEGORIES = listOf("MAIZE" to "Maize", "MACHINERY" to "Machinery", "OTHER" to "Other")

        fun iso(ms: Long): String = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US).apply { timeZone = java.util.TimeZone.getTimeZone("UTC") }.format(java.util.Date(ms))

        /** Rebuilds the form from a stored draft or an announced movement. Unknown or missing fields keep their defaults. */
        fun from(d: JSONObject?, direction: String, now: Long = System.currentTimeMillis()): GateForm = GateForm(direction, now).also { f ->
            if (d == null) return@also
            f.category = d.optString("category", f.category).ifBlank { f.category }
            f.party = d.optString("party"); f.place = d.optString("place")
            f.vehicle = d.optString("vehicleType", "NONE").takeIf { v -> v in VEHICLES.map { it.first } } ?: if (d.optString("vehicleType") == "OTHER") "TRUCK" else "NONE"
            f.registration = d.optString("registration"); f.deliveryNote = d.optString("deliveryNote"); f.note = d.optString("note")
            d.optJSONArray("items")?.let { a ->
                if (a.length() > 0) { f.items.clear(); for (i in 0 until a.length()) a.getJSONObject(i).let { o ->
                    f.items += GateItem(o.optString("name"), o.optString("description"), o.opt("quantity")?.let { q -> if (q is Number && q.toDouble() == Math.floor(q.toDouble())) q.toLong().toString() else q.toString() } ?: "", o.optString("unit"))
                } }
            }
        }
    }
}
