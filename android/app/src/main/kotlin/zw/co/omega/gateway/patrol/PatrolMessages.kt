package zw.co.omega.gateway.patrol

/** Receipt is not verification. Guards need an action, not an internal decision code. */
object PatrolMessages {
    fun result(state: String, decision: String?, localDecision: String? = null): String {
        if (state == "QUEUED" && localDecision != null && localDecision != "LOCAL_MATCH") return result("RECEIVED",localDecision)
        if (state == "QUEUED") return "Saved offline · awaiting confirmation"
        return when (decision) {
            "ACCEPTED" -> "Verified checkpoint"
            "GPS_UNCERTAIN" -> "Location not precise enough · try nearer a window and scan again"
            "GPS_TIME_UNCERTAIN" -> "A fresh location is needed · scan again"
            "OUTSIDE_WINDOW" -> "Scan window expired · wait for the next prompt"
            "OUTSIDE_CHECKPOINT" -> "Outside the checkpoint area · check your position"
            "INVALID_QR_COORDINATES" -> "QR sign is out of date · ask your supervisor for a new sign"
            "WRONG_QR" -> "Wrong checkpoint sign"
            "MOCK_LOCATION" -> "Mock location cannot verify a patrol"
            "ALREADY_COMPLETED" -> "This patrol window is already complete"
            "SESSION_CLOSED" -> "Guard session ended · sign in for the current shift"
            else -> if (state == "REJECTED") "Not accepted · ask the administrator to review" else "Received · awaiting review"
        }
    }
}
