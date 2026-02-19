SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename IN ('workflows','workflow_steps','workflow_runs','workflow_step_logs','workflow_templates')
ORDER BY tablename, policyname;