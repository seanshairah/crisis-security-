package zw.co.crisis.security.ui

import android.os.Bundle
import android.text.InputType
import android.widget.*
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
import zw.co.crisis.security.model.GatewayEvent
import zw.co.crisis.security.net.ApiClient
import zw.co.crisis.security.patrol.GateRuntime
import zw.co.crisis.security.patrol.PatrolStore
import java.util.Calendar
import java.util.UUID

/** One gate workflow inside the guard app. Queued confirmations retain the original guard session. */
class GateInventoryActivity : AppCompatActivity() {
    private lateinit var store: PatrolStore
    private lateinit var prefs: Prefs
    private lateinit var body: LinearLayout
    private var contextData = JSONObject()
    private var chosenCheckpoint = ""
    private var busy = false
    private var formDraft: (() -> Unit)? = null
    private val scanner = registerForActivityResult(ScanContract()) { result -> result.contents?.let { lookup(it) } }
    private fun api() = ApiClient(prefs.serverUrl, prefs.deviceToken)
    private fun session() = store.config()?.optJSONObject("session")?.takeIf { System.currentTimeMillis() < PatrolStore.time(it.getString("expiresAt")) }
    private fun sessionId() = session()?.optString("id") ?: ""
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState); store=PatrolStore.get(this); prefs=Prefs(this)
        contextData=store.meta("gate-cache:${sessionId()}")?.let { JSONObject(it) } ?: JSONObject()
        home(); if(session()!=null) lookup("")
    }
    override fun onPause() { formDraft?.invoke(); super.onPause() }
    private fun page(title: String) {
        formDraft=null
        body=Ui.column(this).apply { setPadding(Ui.dp(this@GateInventoryActivity,22),Ui.dp(this@GateInventoryActivity,24),Ui.dp(this@GateInventoryActivity,22),Ui.dp(this@GateInventoryActivity,24)) }
        body.addView(Ui.title(this,title)); body.addView(Ui.text(this,session()?.optString("siteName") ?: "Sign in for your shift first",15f).apply { setPadding(0,16,0,16) })
        GuardChrome.install(this,body,GuardChrome.Tab.PATROL)
    }
    private fun text(value:String) {body.addView(Ui.text(this,value,15f).apply {setPadding(0,12,0,12)})}
    private fun button(label:String,action:()->Unit) {
        val primary=label in listOf("Record arrival","Record departure","Review physical check","Confirm and save")
        val view=if(primary) HomeView.primaryButton(this,null,label) {if(!busy)action()} else HomeView.secondaryButton(this,null,label) {if(!busy)action()}
        view.minimumHeight=Ui.dp(this,56);view.isEnabled=!busy
        body.addView(view,Ui.lp(-1,-2,Ui.dp(this,8)))
    }
    private fun field(label:String,value:String="",numeric:Boolean=false):EditText {
        text(label)
        return EditText(this).apply { setText(value); hint=label; minHeight=Ui.dp(this@GateInventoryActivity,52); inputType=if(numeric) InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES;body.addView(this,Ui.lp(-1,-2)) }
    }
    private fun select(label:String,options:List<String>,value:String=""):Spinner {
        text(label)
        return Spinner(this).apply { adapter=ArrayAdapter(this@GateInventoryActivity,android.R.layout.simple_spinner_dropdown_item,options);setSelection(options.indexOf(value).coerceAtLeast(0));minimumHeight=Ui.dp(this@GateInventoryActivity,52);body.addView(this,Ui.lp(-1,-2)) }
    }
    private fun checkpoints():List<JSONObject> = contextData.optJSONArray("checkpoints")?.let { a->(0 until a.length()).map { a.getJSONObject(it) } } ?: emptyList()
    private fun home(message:String="") {
        page("Gate Inventory");if(message.isNotBlank())text(message)
        if(session()==null){text("Open Home and sign in to record or check a movement.");return}
        button("Record arrival") { edit("ARRIVAL") };button("Record departure") { edit("DEPARTURE") }
        button("Review pending movements") { lookup("") }
        button("Scan checkpoint or movement QR") { scanner.launch(ScanOptions().setDesiredBarcodeFormats(ScanOptions.QR_CODE).setPrompt("Scan the gate or movement code").setBeepEnabled(true)) }
        val query=field("Find by reference or vehicle registration")
        button("Find movement") {lookup(query.text.toString().trim())}
        button("Send saved records") { lookup("") }
        text("Saved on this phone")
        store.gateRows(sessionId()).forEach { text("${it.first} · ${it.second}") }
        val items=contextData.optJSONArray("items") ?: JSONArray()
        for(i in 0 until items.length()) {
            val m=items.getJSONObject(i)
            val sync=m.optJSONArray("deliveries")?.optJSONObject(0)?.optString("status") ?: "Not queued"
            button("${m.optString("direction")} · ${m.optString("sourceReference")}\nGate: ${m.optString("status")} · Inventory: $sync") { reviewMovement(m) }
        }
    }
    private fun lookup(q:String) {
        if(busy || session()==null)return
        busy=true
        home("Connecting to operations… Saved records stay on this phone.")
        lifecycleScope.launch {
            var message=""
            try {
                val r=withContext(Dispatchers.IO) { GateRuntime(this@GateInventoryActivity).sync(api());api().gateList(sessionId(),q) }
                contextData=r
                if(r.optString("checkpointId").isNotBlank()) chosenCheckpoint=r.getString("checkpointId")
                if(q.isBlank() || q.startsWith("CS2|"))store.setMeta("gate-cache:${sessionId()}",r.toString())
                message=if(q.startsWith("CS2|"))"Checkpoint selected. Choose an action and verify the movement." else "Updated from operations."
            } catch(e:Exception) { message=if(e is ApiClient.ApiException) e.message ?: "Unable to find movement" else "No connection. Saved records remain on this phone; showing the last downloaded list." }
            finally {busy=false;home(message)}
        }
    }
    private fun reviewMovement(m:JSONObject) {
        page("Review movement")
        text("${m.optString("direction")} · ${m.optString("sourceReference")}\nGate: ${m.optString("status")}")
        m.optJSONObject("expected")?.let {text("Submitted details\n${summary(it)}")}
        m.optJSONObject("observed")?.let {text("Observed details\n${summary(it)}")}
        if(m.optString("status")=="PENDING" && m.optJSONObject("observed")==null)button("Record physical check") {edit(m.getString("direction"),m)}
        else text("This movement has already been checked. Operations can review its decision and delivery status.")
        button("Back to gate") {home()}
    }
    private fun summary(d:JSONObject):String {
        val lines=d.optJSONArray("items") ?: JSONArray()
        return "${d.optString("party")} · ${d.optString("place")}\n${d.optString("occurredAt")}\n${d.optString("vehicleType")} ${d.optString("registration")}\n"+(0 until lines.length()).joinToString("\n") {i->val r=lines.getJSONObject(i);"${r.opt("quantity")} ${r.optString("unit")} · ${r.optString("name")} · ${r.optString("description")}"}+"\n${d.optString("note")}"
    }
    private fun edit(direction:String,m:JSONObject?=null,restore:JSONObject?=null) {
        if(session()==null){home();return}
        val key="gate-draft:${sessionId()}:${m?.optString("id") ?: direction}"
        val d=restore ?: store.meta(key)?.let {JSONObject(it)} ?: m?.optJSONObject("expected")?.let { JSONObject(it.toString()).put("occurredAt",GatewayEvent.iso(System.currentTimeMillis())) } ?: JSONObject()
        page(if(direction=="ARRIVAL")"Record arrival" else "Record departure")
        val cps=checkpoints();if(cps.isEmpty()){text("Connect once to download the active checkpoints for your site.");button("Back") {home()};return}
        val cp=select("Gate / checkpoint",cps.map {it.getString("name")},cps.firstOrNull {it.getString("id")==chosenCheckpoint}?.getString("name") ?: "")
        val category=select("Inventory category",listOf("MAIZE","MACHINERY","OTHER"),d.optString("category"))
        val party=field(if(direction=="ARRIVAL")"Supplier / delivering person or company" else "Person taking the goods",d.optString("party"))
        val place=field(if(direction=="ARRIVAL")"Origin" else "Destination",d.optString("place"))
        var occurred=runCatching {PatrolStore.time(d.getString("occurredAt"))}.getOrDefault(System.currentTimeMillis())
        val timeLabel=Ui.text(this,"",15f);body.addView(timeLabel)
        fun updateTime(){timeLabel.text="Actual movement time: ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date(occurred))}"};updateTime()
        button("Change movement date and time") {
            val c=Calendar.getInstance().apply {timeInMillis=occurred}
            android.app.DatePickerDialog(this,{_,y,mo,day->c.set(y,mo,day);android.app.TimePickerDialog(this,{_,h,min->c.set(Calendar.HOUR_OF_DAY,h);c.set(Calendar.MINUTE,min);occurred=c.timeInMillis;updateTime()},c.get(Calendar.HOUR_OF_DAY),c.get(Calendar.MINUTE),true).show()},c.get(Calendar.YEAR),c.get(Calendar.MONTH),c.get(Calendar.DAY_OF_MONTH)).show()
        }
        val vehicle=select("Vehicle (choose NONE for a person on foot)",listOf("NONE","TRUCK","CAR","OTHER"),d.optString("vehicleType"))
        val plate=field("Registration (required when a vehicle is used)",d.optString("registration"))
        val plateLabel=body.getChildAt(body.childCount-2)
        vehicle.onItemSelectedListener=object:AdapterView.OnItemSelectedListener {override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:android.view.View?,pos:Int,id:Long){val visibility=if(pos==0)android.view.View.GONE else android.view.View.VISIBLE;plate.visibility=visibility;plateLabel.visibility=visibility}}
        val note=field("Optional reason / delivery note reference",d.optString("note"))
        val rows=mutableListOf<List<EditText>>()
        var itemInsertIndex=body.childCount
        fun addItem(item:JSONObject) {
            val parent=body;val group=Ui.column(this);body=group
            text("Item ${rows.size+1}")
            val fields=listOf(field("Item / product name",item.optString("name")),field("Description (required for Other)",item.optString("description")),field("Quantity",item.opt("quantity")?.toString() ?: "",true),field("Unit, for example bags, kg or pieces",item.optString("unit")))
            rows+=fields
            button("Remove this item") { if(rows.size>1){rows.remove(fields);parent.removeView(group);itemInsertIndex--} else Toast.makeText(this,"Keep at least one item",Toast.LENGTH_SHORT).show() }
            body=parent;parent.addView(group,itemInsertIndex);itemInsertIndex++
        }
        val existing=d.optJSONArray("items") ?: JSONArray().put(JSONObject())
        for(i in 0 until existing.length())addItem(existing.getJSONObject(i))
        fun values():JSONObject = JSONObject().put("category",category.selectedItem.toString()).put("party",party.text.toString().trim()).put("place",place.text.toString().trim()).put("occurredAt",GatewayEvent.iso(occurred)).put("vehicleType",vehicle.selectedItem.toString()).put("registration",if(vehicle.selectedItem.toString()=="NONE")"" else plate.text.toString().trim()).put("note",note.text.toString().trim()).put("items",JSONArray().apply {rows.forEach {r->put(JSONObject().put("name",r[0].text.toString().trim()).put("description",r[1].text.toString().trim()).put("quantity",r[2].text.toString().toDoubleOrNull() ?: 0).put("unit",r[3].text.toString().trim()))}})
        formDraft={store.setMeta(key,values().toString())}
        button("Add another item") {if(rows.size<40)addItem(JSONObject())}
        button("Review physical check") {
            val details=values();val items=details.getJSONArray("items")
            val invalid=details.getString("party").isBlank() || details.getString("place").isBlank() || (details.getString("vehicleType")!="NONE" && details.getString("registration").isBlank()) || (0 until items.length()).any { val r=items.getJSONObject(it);r.getString("name").isBlank() || r.getString("unit").isBlank() || r.getDouble("quantity")<=0 } || (details.getString("category")=="OTHER" && (0 until items.length()).none {items.getJSONObject(it).getString("description").isNotBlank()})
            if(invalid){AlertDialog.Builder(this).setMessage("Enter the person/company, origin or destination, item, positive quantity and unit. Add registration for a vehicle and a description for Other.").setPositiveButton("OK",null).show();return@button}
            chosenCheckpoint=cps[cp.selectedItemPosition].getString("id");formDraft?.invoke()
            confirm(direction,m,details,key)
        }
        button("Back to gate (keep draft)") {formDraft?.invoke();home()}
    }
    private fun confirm(direction:String,m:JSONObject?,d:JSONObject,key:String) {
        page("Confirm physical check")
        m?.optJSONObject("expected")?.let {text("Submitted\n${summary(it)}")}
        text("You observed\n${summary(d)}")
        val decision=if(m!=null)select("Your decision",listOf("APPROVE","REJECT","REVIEW")) else null
        val reason=if(m!=null)field("Reason (required for rejection or differences)") else null
        button("Confirm and save") {
            val cmd=JSONObject().put("action",if(m==null)"RECORD" else "VERIFY").put("commandId",UUID.randomUUID().toString()).put("sessionId",sessionId()).put("checkpointId",chosenCheckpoint).put("capturedAt",GatewayEvent.iso(System.currentTimeMillis())).put("details",d)
            if(m==null)cmd.put("direction",direction) else {
                val why=reason!!.text.toString().trim();val choice=decision!!.selectedItem.toString()
                val expected=m.optJSONObject("expected")
                val mismatch=expected!=null && listOf("category","items","party","place","vehicleType","registration").any {!zw.co.crisis.security.patrol.GateRules.same(expected.opt(it),d.opt(it))}
                if((choice!="APPROVE" || mismatch) && why.isBlank()){reason.error="Explain the rejection or difference";return@button}
                cmd.put("movementId",m.getString("id")).put("version",m.getInt("version")).put("decision",choice).put("reason",why)
            }
            if(sessionId().isBlank()){home("Your shift has ended. Sign in again before confirming.");return@button}
            store.gateEnqueue(cmd);store.setMeta(key,null);home("Saved on this phone. Gate approval and inventory delivery are confirmed after syncing.");lookup("")
        }
        button("Edit details") {edit(direction,m,d)}
    }
}
