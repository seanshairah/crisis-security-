package zw.co.crisis.security.patrol

/** How a scan reads to the guard right after it: verified by the server, saved and waiting, or a problem to act on. */
enum class ScanOutcome {
    VERIFIED, SAVED, PROBLEM;

    companion object {
        /**
         * [decision] is the server's decision when it has already answered, [localDecision] the phone's own check
         * (LOCAL_MATCH means the position matched on the handset). Amber only while nothing is wrong.
         */
        fun of(decision: String?, localDecision: String?): ScanOutcome = when {
            decision == "ACCEPTED" -> VERIFIED
            decision != null -> PROBLEM
            localDecision != null && localDecision != "LOCAL_MATCH" -> PROBLEM
            else -> SAVED
        }
    }
}
