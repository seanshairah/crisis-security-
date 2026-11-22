package zw.co.crisis.security.patrol
import android.content.Context
import zw.co.crisis.security.net.ApiClient
/** Shares the patrol SQLite ledger and the foreground/worker sync; never changes original session attribution. */
class GateRuntime(context: Context) {
    private val store = PatrolStore.get(context)
    companion object { private val lock = Any() }
    fun sync(api: ApiClient) = synchronized(lock) {
        for (command in store.gatePending()) {
            try {
                val r = api.gateCommand(command)
                store.gateAck(command.getString("commandId"), "SENT", r.toString())
            } catch (e: ApiClient.ApiException) {
                if (e.status in listOf(400,403,404,409)) store.gateAck(command.getString("commandId"), "ATTENTION", e.message ?: "Needs operations review")
                else throw e
            }
        }
    }
}
