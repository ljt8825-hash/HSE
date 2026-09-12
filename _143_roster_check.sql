SELECT 'ins_total='||COUNT(*) FROM personnel_insurance;
SELECT 'ins_active='||COUNT(*) FROM personnel_insurance WHERE is_deleted=false;
SELECT 'ins_emp='||COUNT(*) FROM personnel_insurance WHERE is_deleted=false AND insurance_type='雇主责任险';
SELECT 'ins_inj='||COUNT(*) FROM personnel_insurance WHERE is_deleted=false AND insurance_type='工伤保险';
SELECT 'roster='||COUNT(*) FROM v_employee_current WHERE employee_deleted=false;
