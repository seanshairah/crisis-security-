package zw.co.crisis.security.ui

/**
 * The three-step trail shown after an emergency: saved on the phone, received by operations,
 * acknowledged by a person. Pure so the wording of what has and has not happened is unit-tested:
 * a step is DONE only when the server has said so, never because time has passed.
 */
object DeliveryTrail {
    enum class StepState { DONE, WAITING, FAILED }
    data class Step(val key: String, val state: StepState)

    const val SAVED = "saved"
    const val RECEIVED = "received"
    const val ACKNOWLEDGED = "acknowledged"

    /** [status] is the outbox row's status: QUEUED, SENT, ACKNOWLEDGED, RESOLVED or FAILED. */
    fun steps(status: String?): List<Step> = when (status) {
        "SENT" -> listOf(Step(SAVED, StepState.DONE), Step(RECEIVED, StepState.DONE), Step(ACKNOWLEDGED, StepState.WAITING))
        "ACKNOWLEDGED", "RESOLVED" -> listOf(Step(SAVED, StepState.DONE), Step(RECEIVED, StepState.DONE), Step(ACKNOWLEDGED, StepState.DONE))
        "FAILED" -> listOf(Step(SAVED, StepState.DONE), Step(RECEIVED, StepState.FAILED), Step(ACKNOWLEDGED, StepState.WAITING))
        else -> listOf(Step(SAVED, StepState.DONE), Step(RECEIVED, StepState.WAITING), Step(ACKNOWLEDGED, StepState.WAITING))
    }

    /** True once operations has the alert; the headline stops saying "sending". */
    fun delivered(status: String?): Boolean = status == "SENT" || status == "ACKNOWLEDGED" || status == "RESOLVED"
}
