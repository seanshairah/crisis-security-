package zw.co.crisis.security.patrol

import android.content.Context
import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone

/** Separate durable patrol ledger. Immutable JSON keeps the original guard session after handover. */
class PatrolStore private constructor(context: Context) : SQLiteOpenHelper(context.applicationContext, "crisis_patrol.db", null, 3) {
    init { setWriteAheadLoggingEnabled(true) }
    companion object {
        @Volatile private var instance: PatrolStore? = null
        fun get(context: Context): PatrolStore = instance ?: synchronized(this) { instance ?: PatrolStore(context).also { instance = it } }
        fun time(s: String): Long = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC"); isLenient = false }.parse(s)?.time ?: 0
    }
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE config (id INTEGER PRIMARY KEY CHECK(id=1), json TEXT NOT NULL)")
        db.execSQL("CREATE TABLE events (eventId TEXT PRIMARY KEY, assignmentId TEXT NOT NULL, json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'QUEUED', decision TEXT, createdAt INTEGER NOT NULL)")
        db.execSQL("CREATE TABLE prompted (assignmentId TEXT PRIMARY KEY)")
        upgradeTo2(db, false)
        upgradeTo3(db)
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) { if(oldVersion < 2) upgradeTo2(db, true); if(oldVersion < 3) upgradeTo3(db) }
    private fun upgradeTo3(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE gate_commands (id TEXT PRIMARY KEY, json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'QUEUED', result TEXT, createdAt INTEGER NOT NULL)")
    }
    @Synchronized fun gateEnqueue(command: JSONObject) {
        writableDatabase.insertOrThrow("gate_commands", null, ContentValues().apply { put("id", command.getString("commandId")); put("json", command.toString()); put("createdAt", System.currentTimeMillis()) })
    }
    @Synchronized fun gatePending(): List<JSONObject> = readableDatabase.rawQuery("SELECT json FROM gate_commands WHERE state='QUEUED' ORDER BY createdAt LIMIT 20", null).use { c -> buildList { while(c.moveToNext()) add(JSONObject(c.getString(0))) } }
    @Synchronized fun gateAck(id: String, state: String, result: String) { writableDatabase.execSQL("UPDATE gate_commands SET state=?,result=? WHERE id=?", arrayOf(state,result,id)) }
    @Synchronized fun gateRows(sessionId: String): List<Pair<String,String>> = readableDatabase.rawQuery("SELECT json,state,result FROM gate_commands ORDER BY createdAt DESC LIMIT 100", null).use { c -> buildList { while(c.moveToNext()) { val j=JSONObject(c.getString(0)); if(j.optString("sessionId")==sessionId) add(j.optString("direction", "Physical check") to (c.getString(2) ?: "Saved on phone · waiting for connection")) } } }
    @Synchronized fun gatePendingCount(): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM gate_commands WHERE state='QUEUED'", null).use { it.moveToFirst();it.getInt(0) }
    private fun upgradeTo2(db: SQLiteDatabase, existing: Boolean) {
        db.execSQL("ALTER TABLE events ADD COLUMN checkpointName TEXT NOT NULL DEFAULT 'Checkpoint'")
        db.execSQL("ALTER TABLE events ADD COLUMN localDecision TEXT")
        db.execSQL("ALTER TABLE events ADD COLUMN notifiedAt INTEGER")
        db.execSQL("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)")
        // Don't send new success alerts for historical receipts during an app upgrade.
        if(existing) db.execSQL("UPDATE events SET notifiedAt=? WHERE decision='ACCEPTED'", arrayOf(System.currentTimeMillis()))
    }
    @Synchronized fun config(): JSONObject? = readableDatabase.rawQuery("SELECT json FROM config WHERE id=1", null).use { if (it.moveToFirst()) JSONObject(it.getString(0)) else null }
    @Synchronized fun saveConfig(json: JSONObject) { writableDatabase.insertWithOnConflict("config", null, ContentValues().apply { put("id", 1); put("json", json.toString()) }, SQLiteDatabase.CONFLICT_REPLACE) }
    @Synchronized fun clearSession() { saveConfig(JSONObject().put("session", JSONObject.NULL)) }
    @Synchronized fun enqueue(event: JSONObject, checkpointName: String = "Checkpoint", localDecision: String? = null) {
        writableDatabase.insertOrThrow("events", null, ContentValues().apply { put("eventId", event.getString("eventId")); put("assignmentId", event.getString("assignmentId")); put("json", event.toString()); put("createdAt", System.currentTimeMillis()); put("checkpointName", checkpointName); put("localDecision", localDecision) })
    }
    @Synchronized fun pending(): List<JSONObject> = readableDatabase.rawQuery("SELECT json FROM events WHERE state='QUEUED' ORDER BY createdAt LIMIT 20", null).use { c -> buildList { while (c.moveToNext()) add(JSONObject(c.getString(0))) } }
    @Synchronized fun hasScan(id: String): Boolean = readableDatabase.rawQuery("SELECT 1 FROM events WHERE assignmentId=? AND ((state='QUEUED' AND (localDecision IS NULL OR localDecision='LOCAL_MATCH')) OR decision='ACCEPTED') LIMIT 1", arrayOf(id)).use { it.moveToFirst() }
    @Synchronized fun ack(id: String, state: String, decision: String) { writableDatabase.execSQL("UPDATE events SET state=?, decision=? WHERE eventId=?", arrayOf(state, decision, id)) }
    data class ScanRow(val eventId: String, val assignmentId: String, val checkpointName: String, val state: String, val decision: String?, val localDecision: String?, val capturedAt: String)
    @Synchronized fun recentRows(limit: Int = 5): List<ScanRow> = readableDatabase.rawQuery("SELECT eventId,assignmentId,checkpointName,state,decision,localDecision,json FROM events ORDER BY createdAt DESC LIMIT ?", arrayOf(limit.toString())).use { c -> buildList { while(c.moveToNext()) add(ScanRow(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.getString(4),c.getString(5),JSONObject(c.getString(6)).getString("capturedAt"))) } }
    @Synchronized fun successNotices(): List<ScanRow> = readableDatabase.rawQuery("SELECT eventId,assignmentId,checkpointName,state,decision,localDecision,json FROM events WHERE decision='ACCEPTED' AND notifiedAt IS NULL ORDER BY createdAt LIMIT 20", null).use { c -> buildList { while(c.moveToNext()) add(ScanRow(c.getString(0),c.getString(1),c.getString(2),c.getString(3),c.getString(4),c.getString(5),JSONObject(c.getString(6)).getString("capturedAt"))) } }
    @Synchronized fun markNotified(id: String) { writableDatabase.execSQL("UPDATE events SET notifiedAt=? WHERE eventId=? AND decision='ACCEPTED'", arrayOf(System.currentTimeMillis(),id)) }
    @Synchronized fun pendingCount(): Int = readableDatabase.rawQuery("SELECT COUNT(*) FROM events WHERE state='QUEUED'", null).use { it.moveToFirst();it.getInt(0) }
    @Synchronized fun setMeta(key: String, value: String?) { writableDatabase.insertWithOnConflict("meta", null, ContentValues().apply { put("key",key);put("value",value) }, SQLiteDatabase.CONFLICT_REPLACE) }
    @Synchronized fun meta(key: String): String? = readableDatabase.rawQuery("SELECT value FROM meta WHERE key=?", arrayOf(key)).use { if(it.moveToFirst()) it.getString(0) else null }
    @Synchronized fun promptOnce(id: String): Boolean = writableDatabase.insertWithOnConflict("prompted", null, ContentValues().apply { put("assignmentId", id) }, SQLiteDatabase.CONFLICT_IGNORE) != -1L
    @Synchronized fun recent(): List<String> = readableDatabase.rawQuery("SELECT state, decision FROM events ORDER BY createdAt DESC LIMIT 10", null).use { c -> buildList { while (c.moveToNext()) add(PatrolMessages.result(c.getString(0), if(c.isNull(1)) null else c.getString(1))) } }
    @Synchronized fun summary(): String = readableDatabase.rawQuery("SELECT state, COUNT(*) FROM events GROUP BY state", null).use { c -> buildList { while(c.moveToNext()) add("${c.getInt(1)} ${c.getString(0).lowercase()}") }.joinToString(" · ") }
}
