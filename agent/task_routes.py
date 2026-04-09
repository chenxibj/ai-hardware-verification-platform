"""
task_routes.py - Agent-side task operations that bypass backend JAR limitations.
#313: Safe task deletion (cascading FK cleanup)
#317: Fix createdBy field
"""
import logging
import psycopg2
import os
from flask import Blueprint, jsonify, request

logger = logging.getLogger("agent.task_routes")

task_bp = Blueprint("task_routes", __name__, url_prefix="/api/tasks")

def get_db_conn():
    """Get direct DB connection."""
    return psycopg2.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", 5432)),
        dbname=os.environ.get("DB_NAME", "ahvp"),
        user=os.environ.get("DB_USER", "ahvp"),
        password=os.environ.get("DB_PASSWORD", "Ahvp@2026Secure"),
    )


@task_bp.route("/safe-delete/<int:task_id>", methods=["DELETE"])
def safe_delete_task(task_id):
    """#313: Safely delete a task by cleaning up FK dependencies first."""
    conn = None
    try:
        conn = get_db_conn()
        cur = conn.cursor()

        # Check task exists
        cur.execute("SELECT id, task_no, status FROM evaluation_tasks WHERE id = %s", (task_id,))
        task = cur.fetchone()
        if not task:
            return jsonify({"code": -1, "message": "任务不存在"}), 404

        # Delete in FK dependency order
        tables = [
            ("task_logs", "task_id"),
            ("eval_logs", "task_id"),
            ("evaluation_results", "task_id"),
            ("task_environments", "task_id"),
            ("task_executions", "task_id"),
            ("evaluation_reports", "task_id"),
            ("alerts", "task_id"),
        ]
        deleted_counts = {}
        for table, col in tables:
            cur.execute(f"DELETE FROM {table} WHERE {col} = %s", (task_id,))
            deleted_counts[table] = cur.rowcount

        # Delete child tasks (self-referencing FK)
        cur.execute("UPDATE evaluation_tasks SET parent_task_id = NULL WHERE parent_task_id = %s", (task_id,))
        cur.execute("UPDATE evaluation_tasks SET retry_from_task_id = NULL WHERE retry_from_task_id = %s", (task_id,))

        # Finally delete the task itself
        cur.execute("DELETE FROM evaluation_tasks WHERE id = %s", (task_id,))

        conn.commit()
        logger.info("Safe-deleted task %s, cleanup: %s", task_id, deleted_counts)
        return jsonify({
            "code": 0,
            "message": "任务已安全删除",
            "data": {"taskId": task_id, "cleanedUp": deleted_counts},
        })
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error("Safe delete failed for task %s: %s", task_id, e)
        return jsonify({"code": -1, "message": f"删除失败: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()


@task_bp.route("/fix-created-by", methods=["POST"])
def fix_created_by():
    """#317: Fix createdBy after task creation (backend always sets 1)."""
    data = request.get_json()
    if not data:
        return jsonify({"code": -1, "message": "缺少请求体"}), 400
    task_id = data.get("taskId")
    user_id = data.get("userId")
    if not task_id or not user_id:
        return jsonify({"code": -1, "message": "需要 taskId 和 userId"}), 400

    conn = None
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE evaluation_tasks SET created_by = %s WHERE id = %s AND created_by = 1",
            (user_id, task_id),
        )
        updated = cur.rowcount
        conn.commit()
        return jsonify({"code": 0, "message": f"已更新 {updated} 条", "data": {"updated": updated}})
    except Exception as e:
        if conn:
            conn.rollback()
        logger.error("Fix createdBy failed: %s", e)
        return jsonify({"code": -1, "message": str(e)}), 500
    finally:
        if conn:
            conn.close()
