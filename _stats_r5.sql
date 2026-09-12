SELECT COUNT(*)::int AS v FROM over_age_personnel WHERE is_deleted = false AND control_type LIKE '%高危%';
