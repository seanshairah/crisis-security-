package zw.co.crisis.security.patrol

import org.json.JSONObject

/**
 * The three things a guard must never confuse (handoff "Gate Inventory"): did this phone keep the check, has the gate
 * decided, and has the inventory system been told. Each is its own row; a local save never reads as approval.
 */
object GateTracks {
    enum class Tone { OK, WAIT, WARN, CRITICAL, IDLE }
    data class Track(val title: String, val value: String, val chip: String, val tone: Tone)

    /** [localState] is the offline ledger state: QUEUED (still on the phone), SENT (server has it) or ATTENTION (server refused it). */
    fun forLocal(localState: String): List<Track> = when (localState) {
        "SENT" -> listOf(device("Reached server", "Done", Tone.OK), gate("Waiting for the gate decision", "Waiting", Tone.WAIT), sync("Not queued", "Idle", Tone.IDLE))
        "ATTENTION" -> listOf(device("Needs operations", "Check", Tone.CRITICAL), gate("Not decided", "Stopped", Tone.CRITICAL), sync("Not queued", "Idle", Tone.IDLE))
        else -> listOf(device("Saved on phone", "Waiting", Tone.WAIT), gate("Not decided yet", "Review", Tone.WARN), sync("Not queued", "Idle", Tone.IDLE))
    }

    /** A receipt is a snapshot; a later server refresh may contain a supervisor decision or delivery result. */
    fun forReceipt(localState: String, result: String?, latest: List<JSONObject>): List<Track> {
        if (localState != "SENT" || result == null) return forLocal(localState)
        val receipt = runCatching { JSONObject(result) }.getOrNull() ?: return forLocal(localState)
        val id = receipt.optString("id")
        val current = latest.firstOrNull { id.isNotBlank() && it.optString("id") == id }
        return forMovement(current ?: receipt)
    }

    /** From a movement the server returned. */
    fun forMovement(m: JSONObject): List<Track> {
        val delivery = m.optJSONArray("deliveries")?.optJSONObject(0)
        return listOf(device("Reached server", "Done", Tone.OK), gateFor(m.optString("status")), syncFor(delivery, m.optString("status")))
    }

    fun gateFor(status: String): Track = when (status) {
        "APPROVED" -> gate("Cleared at gate", "Approved", Tone.OK)
        "REJECTED" -> gate("Not cleared", "Rejected", Tone.CRITICAL)
        "REVIEW" -> gate("Supervisor will decide", "Review", Tone.WARN)
        "CANCELLED" -> gate("Withdrawn by inventory", "Withdrawn", Tone.IDLE)
        else -> gate("Awaiting a physical check", "Pending", Tone.WAIT)
    }

    fun syncFor(delivery: JSONObject?, gateStatus: String): Track {
        if (delivery == null) return if (gateStatus == "APPROVED" || gateStatus == "REJECTED") sync("Queuing", "Waiting", Tone.WAIT) else sync("Not queued", "Idle", Tone.IDLE)
        if (!delivery.isNull("deadAt") && delivery.optString("deadAt").isNotBlank()) return sync("Needs attention", "Failed", Tone.CRITICAL)
        return when (delivery.optString("status")) {
            "SENT" -> sync("Received by inventory", "Sent", Tone.OK)
            "SENDING" -> sync("Sending", "Sending", Tone.WAIT)
            "FAILED" -> sync("Retrying automatically", "Retry", Tone.WARN)
            else -> sync("Waiting to send", "Waiting", Tone.WAIT)
        }
    }

    /** One sentence for the guard about what to do with the goods now. */
    fun advice(tracks: List<Track>): String = when {
        tracks[0].tone == Tone.CRITICAL -> "Operations needs to look at this. Keep the goods on hold and call them."
        tracks[1].tone == Tone.OK -> "Cleared. You can release the goods."
        tracks[1].tone == Tone.CRITICAL -> "Not cleared. Do not release the goods."
        else -> "Saved on phone is not server approval. Keep the goods on hold until the decision is final."
    }

    private fun device(v: String, c: String, t: Tone) = Track("Device", v, c, t)
    private fun gate(v: String, c: String, t: Tone) = Track("Gate approval", v, c, t)
    private fun sync(v: String, c: String, t: Tone) = Track("Inventory system", v, c, t)
}
