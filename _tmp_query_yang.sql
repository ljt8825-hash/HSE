\encoding UTF8
SELECT 'driver_three_violation' AS tbl, id, driver_name AS nm, coalesce(violation_date::text,'') AS vdate, violation_type, description, coalesce(vehicle_no,'') AS veh FROM driver_three_violation WHERE driver_name LIKE '%杨小林%'
UNION ALL
SELECT 'driver_violation', id, driver_name, coalesce(violation_date::text,''), violation_type, description, coalesce(vehicle_no,'') FROM driver_violation WHERE driver_name LIKE '%杨小林%'
UNION ALL
SELECT 'violation_records', id, employee_name, coalesce(violation_date::text,''), violation_type, description, coalesce(vehicle_no,'') FROM violation_records WHERE employee_name LIKE '%杨小林%';