package zw.co.crisis.security.patrol
import org.json.JSONObject
import org.json.JSONArray
/** Compare physical fields structurally, irrespective of PostgreSQL JSON key order. */
object GateRules {
    fun same(a: Any?, b: Any?): Boolean {
        if(a is JSONObject && b is JSONObject) {
            val ak=a.keys().asSequence().toSet();val bk=b.keys().asSequence().toSet()
            return ak==bk && ak.all {same(a.opt(it),b.opt(it))}
        }
        if(a is JSONArray && b is JSONArray) return a.length()==b.length() && (0 until a.length()).all {same(a.opt(it),b.opt(it))}
        if(a is Number && b is Number)return a.toDouble()==b.toDouble()
        return a==b
    }
}
