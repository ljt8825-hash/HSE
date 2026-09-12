const { auditLog } = require('../routes/audit');
const { pool, isConnected } = require('../config/db');
const { success, error } = require('../middleware/response');
const ExcelUtils = require('../utils/excel');
const { deleteFile } = require('../middleware/upload');

var memoryVehicles = [];
var memoryIdCounter = 1;

function initMemoryData() {
  if (memoryVehicles.length > 0) return;
  memoryVehicles = [
    { id: 1, plate: '鲁N12345', vin: 'LSVAU218XK2123456', engine_no: 'EA88812345', reg_date: '2020-01-15', model: '大众迈腾', owner: '张三', insurance_type: '交强险', insurance_start: '2024-01-15', insurance_end: '2025-01-15', premium: 950, vehicle_type: '轿车', status: '在用', remark: '公司用车' },
    { id: 2, plate: '鲁N67890', vin: 'LSGBL5339KF123456', engine_no: '1.5T12345', reg_date: '2019-06-20', model: '别克君威', owner: '李四', insurance_type: '商业险', insurance_start: '2024-06-20', insurance_end: '2025-06-20', premium: 3500, vehicle_type: '轿车', status: '在用', remark: '' },
    { id: 3, plate: '鲁N24680', vin: 'LDC953L27K1234567', engine_no: '1.6L12345', reg_date: '2021-03-10', model: '雪铁龙C6', owner: '王五', insurance_type: '交强险+商业险', insurance_start: '2024-03-10', insurance_end: '2025-03-10', premium: 4200, vehicle_type: '轿车', status: '在用', remark: '' },
    { id: 4, plate: '鲁N13579', vin: 'LGBF1CE09KY123456', engine_no: '2.0L12345', reg_date: '2022-09-05', model: '日产天籁', owner: '赵六', insurance_type: '交强险', insurance_start: '2024-09-05', insurance_end: '2025-09-05', premium: 950, vehicle_type: '轿车', status: '在用', remark: '' },
    { id: 5, plate: '鲁N86420', vin: 'LSVCN2187N2123456', engine_no: 'EA88865432', reg_date: '2023-01-20', model: '大众帕萨特', owner: '钱七', insurance_type: '商业险', insurance_start: '2024-01-20', insurance_end: '2024-07-20', premium: 3800, vehicle_type: '轿车', status: '在用', remark: '保险即将到期' },
    { id: 6, plate: '鲁N97531', vin: 'LGBH5337KF1234567', engine_no: '1.5T65432', reg_date: '2020-08-10', model: '别克GL8', owner: '孙八', insurance_type: '交强险+商业险', insurance_start: '2023-08-10', insurance_end: '2024-08-10', premium: 5200, vehicle_type: '商务车', status: '在用', remark: '已脱保' },
    { id: 7, plate: '鲁N55555', vin: 'LSGJA5334KF123456', engine_no: '2.0T12345', reg_date: '2021-12-01', model: '雪佛兰探界者', owner: '周九', insurance_type: '交强险', insurance_start: '2024-12-01', insurance_end: '2025-12-01', premium: 1100, vehicle_type: 'SUV', status: '在用', remark: '' },
    { id: 8, plate: '鲁N66666', vin: 'LDC953L25N2123456', engine_no: '1.6T65432', reg_date: '2022-05-15', model: '雪铁龙天逸', owner: '吴十', insurance_type: '商业险', insurance_start: '2024-05-15', insurance_end: '2025-05-15', premium: 4100, vehicle_type: 'SUV', status: '停用', remark: '维修中' }
  ];
  memoryIdCounter = 9;
}

class VehiclesController {
  async list(req, res, next) {
    try {
      if (!isConnected()) {
        initMemoryData();
        let data = memoryVehicles.filter(v => !v.is_deleted);
        const { page = 1, pageSize = 20, keyword = '', insuranceType = '', status = '', sortBy = 'id', sortOrder = 'DESC' } = req.query;

        if (keyword) {
          const kw = keyword.toLowerCase();
          data = data.filter(v =>
            v.plate.toLowerCase().includes(kw) ||
            (v.vin && v.vin.toLowerCase().includes(kw)) ||
            (v.model && v.model.toLowerCase().includes(kw)) ||
            (v.owner && v.owner.toLowerCase().includes(kw))
          );
        }
        if (insuranceType) data = data.filter(v => v.insurance_type === insuranceType);
        if (status) data = data.filter(v => v.status === status);

        const total = data.length;
        const offset = (page - 1) * pageSize;
        const list = data.slice(offset, offset + parseInt(pageSize));

        res.json(success({ list, total, page: parseInt(page), pageSize: parseInt(pageSize), totalPages: Math.ceil(total / pageSize) }, '查询成功(内存模式)'));
        return;
      }

      const {
        page = 1,
        pageSize = 20,
        keyword = '',
        insuranceType = '',
        status = '',
        expiringDays = '',
        sortBy = 'id',
        sortOrder = 'DESC'
      } = req.query;

      const allowedSort = ['id', 'plate', 'reg_date', 'insurance_end', 'premium'];
      const actualSort = allowedSort.includes(sortBy) ? sortBy : 'id';
      const actualOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      let whereSql = ' WHERE v.is_deleted = false';
      const params = [];
      let paramIdx = 0;

      if (keyword) {
        paramIdx++;
        whereSql += ` AND (v.plate ILIKE $${paramIdx} OR v.vin ILIKE $${paramIdx} OR v.model ILIKE $${paramIdx} OR v.owner ILIKE $${paramIdx})`;
        params.push(`%${keyword}%`);
      }

      if (insuranceType) {
        paramIdx++;
        whereSql += ` AND v.insurance_type = $${paramIdx}`;
        params.push(insuranceType);
      }

      if (status) {
        paramIdx++;
        whereSql += ` AND v.status = $${paramIdx}`;
        params.push(status);
      }

      if (expiringDays && !isNaN(expiringDays)) {
        const days = parseInt(expiringDays);
        paramIdx++;
        whereSql += ` AND v.insurance_end IS NOT NULL AND (v.insurance_end::date - CURRENT_DATE) <= $${paramIdx}`;
        params.push(days);
      }

      const countSql = `SELECT COUNT(*) as total FROM vehicles v ${whereSql}`;
      const countResult = await pool.query(countSql, params);
      const total = parseInt(countResult.rows[0].total);

      const offset = (page - 1) * pageSize;
      paramIdx++;
      const limitParam = paramIdx;
      params.push(parseInt(pageSize));
      paramIdx++;
      const offsetParam = paramIdx;
      params.push(offset);

      const listSql = `
        SELECT v.id, v.plate, v.vin, v.engine_no, v.reg_date, v.model, v.owner,
               v.insurance_type, v.insurance_start, v.insurance_end,
               v.premium, v.vehicle_type, v.status, v.remark,
               v.created_at, v.updated_at,
               (v.insurance_end::date - CURRENT_DATE) AS days_to_expire
        FROM vehicles v
        ${whereSql}
        ORDER BY v.${actualSort} ${actualOrder}
        LIMIT $${limitParam} OFFSET $${offsetParam}
      `;

      const result = await pool.query(listSql, params);

      res.json(success({
        list: result.rows,
        total,
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        totalPages: Math.ceil(total / pageSize)
      }, '查询成功'));
    } catch (err) {
      next(err);
    }
  }

  async detail(req, res, next) {
    try {
      if (!isConnected()) {
        initMemoryData();
        const { id } = req.params;
        if (!id || isNaN(id)) {
          return res.json(error(-1, '参数错误：ID必须为数字'));
        }
        const vehicle = memoryVehicles.find(v => v.id === parseInt(id) && !v.is_deleted);
        if (!vehicle) {
          return res.json(error(-2, '车辆不存在或已删除'));
        }
        vehicle.history = [];
        res.json(success(vehicle, '查询成功(内存模式)'));
        return;
      }

      const { id } = req.params;

      if (!id || isNaN(id)) {
        return res.json(error(-1, '参数错误：ID必须为数字'));
      }

      const sql = `
        SELECT v.id, v.plate, v.vin, v.engine_no, v.reg_date, v.model, v.owner,
               v.insurance_type, v.insurance_start, v.insurance_end,
               v.premium, v.vehicle_type, v.status, v.remark,
               v.created_at, v.updated_at,
               (v.insurance_end::date - CURRENT_DATE) AS days_to_expire
        FROM vehicles v
        WHERE v.id = $1 AND v.is_deleted = false
      `;
      const result = await pool.query(sql, [id]);

      if (result.rows.length === 0) {
        return res.json(error(-2, '车辆不存在或已删除'));
      }

      const vehicle = result.rows[0];

      const histSql = `
        SELECT id, insurance_type, start_date, end_date, premium, is_current,
               policy_no, insurer, remark, created_at
        FROM insurance_history
        WHERE vehicle_id = $1 AND is_deleted = false
        ORDER BY end_date DESC
      `;
      const histResult = await pool.query(histSql, [id]);
      vehicle.history = histResult.rows;

      res.json(success(vehicle, '查询成功'));
    } catch (err) {
      next(err);
    }
  }

  async create(req, res, next) {
    try {
      if (!isConnected()) {
        initMemoryData();
        const { plate, vin, engine_no, reg_date, model, owner, insurance_type, insurance_start, insurance_end, premium, vehicle_type, status, remark } = req.body;

        if (!plate) {
          return res.json(error(-1, '车牌号不能为空'));
        }

        const plateTrim = plate.trim().toUpperCase();
        if (memoryVehicles.some(v => v.plate === plateTrim && !v.is_deleted)) {
          return res.json(error(-2, '该车牌号已存在'));
        }

        const newVehicle = {
          id: memoryIdCounter++,
          plate: plateTrim,
          vin: vin ? vin.trim() : null,
          engine_no: engine_no ? engine_no.trim() : null,
          reg_date: reg_date || null,
          model: model ? model.trim() : null,
          owner: owner ? owner.trim() : null,
          insurance_type: insurance_type || null,
          insurance_start: insurance_start || null,
          insurance_end: insurance_end || null,
          premium: premium || 0,
          vehicle_type: vehicle_type || null,
          status: status || '在用',
          remark: remark || null
        };
        memoryVehicles.push(newVehicle);
        auditLog({ userId: req.user?.id, username: req.user?.username, action: 'create', module: 'vehicles', description: `新增车辆(内存): ${plateTrim}`, ip: req.ip }).catch(() => {});
        res.json(success({ id: newVehicle.id }, '新增成功(内存模式)'));
        return;
      }

      const {
        plate, vin, engine_no, reg_date, model, owner,
        insurance_type, insurance_start, insurance_end,
        premium, vehicle_type, status, remark
      } = req.body;

      if (!plate) {
        return res.json(error(-1, '车牌号不能为空'));
      }

      const plateTrim = plate.trim().toUpperCase();
      const existResult = await pool.query(
        'SELECT id FROM vehicles WHERE plate = $1 AND is_deleted = false',
        [plateTrim]
      );
      if (existResult.rows.length > 0) {
        return res.json(error(-2, '该车牌号已存在'));
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const insertSql = `
          INSERT INTO vehicles
          (plate, vin, engine_no, reg_date, model, owner, insurance_type,
           insurance_start, insurance_end, premium, vehicle_type, status, remark)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `;
        const insertResult = await client.query(insertSql, [
          plateTrim,
          vin ? vin.trim() : null,
          engine_no ? engine_no.trim() : null,
          reg_date || null,
          model ? model.trim() : null,
          owner ? owner.trim() : null,
          insurance_type || null,
          insurance_start || null,
          insurance_end || null,
          premium || 0,
          vehicle_type || null,
          status || '在用',
          remark || null
        ]);

        const vehicleId = insertResult.rows[0].id;

        if (insurance_start && insurance_end) {
          const histSql = `
            INSERT INTO insurance_history
            (vehicle_id, plate, insurance_type, start_date, end_date, premium, is_current)
            VALUES ($1, $2, $3, $4, $5, $6, true)
          `;
          await client.query(histSql, [
            vehicleId, plateTrim, insurance_type,
            insurance_start, insurance_end, premium || 0
          ]);
        }

        await client.query('COMMIT');
        auditLog({ userId: req.user?.id, username: req.user?.username, action: 'create', module: 'vehicles', description: `新增车辆: ${plateTrim}`, ip: req.ip }).catch(() => {});
        res.json(success({ id: vehicleId }, '新增成功'));
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      if (!isConnected()) {
        initMemoryData();
        const { id } = req.params;
        const { plate, vin, engine_no, reg_date, model, owner, insurance_type, insurance_start, insurance_end, premium, vehicle_type, status, remark } = req.body;

        if (!id || isNaN(id)) {
          return res.json(error(-1, '参数错误：ID必须为数字'));
        }

        const idx = memoryVehicles.findIndex(v => v.id === parseInt(id) && !v.is_deleted);
        if (idx === -1) {
          return res.json(error(-2, '车辆不存在或已删除'));
        }

        const vehicle = memoryVehicles[idx];
        if (plate && plate.trim().toUpperCase() !== vehicle.plate) {
          const plateTrim = plate.trim().toUpperCase();
          if (memoryVehicles.some(v => v.plate === plateTrim && v.id !== parseInt(id) && !v.is_deleted)) {
            return res.json(error(-3, '该车牌号已存在'));
          }
          vehicle.plate = plateTrim;
        }

        if (vin !== undefined) vehicle.vin = vin.trim() || null;
        if (engine_no !== undefined) vehicle.engine_no = engine_no.trim() || null;
        if (reg_date !== undefined) vehicle.reg_date = reg_date || null;
        if (model !== undefined) vehicle.model = model.trim() || null;
        if (owner !== undefined) vehicle.owner = owner.trim() || null;
        if (insurance_type !== undefined) vehicle.insurance_type = insurance_type || null;
        if (insurance_start !== undefined) vehicle.insurance_start = insurance_start || null;
        if (insurance_end !== undefined) vehicle.insurance_end = insurance_end || null;
        if (premium !== undefined) vehicle.premium = premium || 0;
        if (vehicle_type !== undefined) vehicle.vehicle_type = vehicle_type || null;
        if (status !== undefined) vehicle.status = status || '在用';
        if (remark !== undefined) vehicle.remark = remark || null;
        auditLog({ userId: req.user?.id, username: req.user?.username, action: 'update', module: 'vehicles', description: `更新车辆(内存) ID=${id}`, ip: req.ip }).catch(() => {});

        res.json(success({ id: parseInt(id) }, '更新成功(内存模式)'));
        return;
      }

      const { id } = req.params;
      const {
        plate, vin, engine_no, reg_date, model, owner,
        insurance_type, insurance_start, insurance_end,
        premium, vehicle_type, status, remark
      } = req.body;

      if (!id || isNaN(id)) {
        return res.json(error(-1, '参数错误：ID必须为数字'));
      }

      const existResult = await pool.query(
        'SELECT id, plate FROM vehicles WHERE id = $1 AND is_deleted = false',
        [id]
      );
      if (existResult.rows.length === 0) {
        return res.json(error(-2, '车辆不存在或已删除'));
      }

      if (plate && plate.trim().toUpperCase() !== existResult.rows[0].plate) {
        const plateTrim = plate.trim().toUpperCase();
        const dupResult = await pool.query(
          'SELECT id FROM vehicles WHERE plate = $1 AND id != $2 AND is_deleted = false',
          [plateTrim, id]
        );
        if (dupResult.rows.length > 0) {
          return res.json(error(-3, '该车牌号已存在'));
        }
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const updateFields = [];
        const updateValues = [];
        let paramIdx = 0;

        if (plate !== undefined) { paramIdx++; updateFields.push(`plate = $${paramIdx}`); updateValues.push(plate.trim().toUpperCase()); }
        if (vin !== undefined) { paramIdx++; updateFields.push(`vin = $${paramIdx}`); updateValues.push(vin.trim() || null); }
        if (engine_no !== undefined) { paramIdx++; updateFields.push(`engine_no = $${paramIdx}`); updateValues.push(engine_no.trim() || null); }
        if (reg_date !== undefined) { paramIdx++; updateFields.push(`reg_date = $${paramIdx}`); updateValues.push(reg_date || null); }
        if (model !== undefined) { paramIdx++; updateFields.push(`model = $${paramIdx}`); updateValues.push(model.trim() || null); }
        if (owner !== undefined) { paramIdx++; updateFields.push(`owner = $${paramIdx}`); updateValues.push(owner.trim() || null); }
        if (insurance_type !== undefined) { paramIdx++; updateFields.push(`insurance_type = $${paramIdx}`); updateValues.push(insurance_type || null); }
        if (insurance_start !== undefined) { paramIdx++; updateFields.push(`insurance_start = $${paramIdx}`); updateValues.push(insurance_start || null); }
        if (insurance_end !== undefined) { paramIdx++; updateFields.push(`insurance_end = $${paramIdx}`); updateValues.push(insurance_end || null); }
        if (premium !== undefined) { paramIdx++; updateFields.push(`premium = $${paramIdx}`); updateValues.push(premium || 0); }
        if (vehicle_type !== undefined) { paramIdx++; updateFields.push(`vehicle_type = $${paramIdx}`); updateValues.push(vehicle_type || null); }
        if (status !== undefined) { paramIdx++; updateFields.push(`status = $${paramIdx}`); updateValues.push(status || '在用'); }
        if (remark !== undefined) { paramIdx++; updateFields.push(`remark = $${paramIdx}`); updateValues.push(remark || null); }

        if (updateFields.length === 0) {
          return res.json(error(-4, '没有需要更新的字段'));
        }

        paramIdx++;
        updateValues.push(id);
        const updateSql = `UPDATE vehicles SET ${updateFields.join(', ')} WHERE id = $${paramIdx}`;
        await client.query(updateSql, updateValues);

        if (insurance_start && insurance_end) {
          const currentHistResult = await client.query(
            'SELECT id FROM insurance_history WHERE vehicle_id = $1 AND is_current = true AND is_deleted = false',
            [id]
          );

          const currentPlate = plate ? plate.trim().toUpperCase() : existResult.rows[0].plate;

          if (currentHistResult.rows.length > 0) {
            await client.query(
              `UPDATE insurance_history SET insurance_type = $1, start_date = $2, end_date = $3, premium = $4, is_current = true
               WHERE id = $5`,
              [insurance_type, insurance_start, insurance_end, premium || 0, currentHistResult.rows[0].id]
            );
          } else {
            await client.query(
              `INSERT INTO insurance_history (vehicle_id, plate, insurance_type, start_date, end_date, premium, is_current)
               VALUES ($1, $2, $3, $4, $5, $6, true)`,
              [id, currentPlate, insurance_type, insurance_start, insurance_end, premium || 0]
            );
          }
        }

        await client.query('COMMIT');
        auditLog({ userId: req.user?.id, username: req.user?.username, action: 'update', module: 'vehicles', description: `更新车辆 ID=${id}`, ip: req.ip }).catch(() => {});
        res.json(success({ id: parseInt(id) }, '更新成功'));
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      if (!isConnected()) {
        initMemoryData();
        const { id } = req.params;
        if (!id || isNaN(id)) {
          return res.json(error(-1, '参数错误：ID必须为数字'));
        }
        const idx = memoryVehicles.findIndex(v => v.id === parseInt(id) && !v.is_deleted);
        if (idx === -1) {
          return res.json(error(-2, '车辆不存在或已删除'));
        }
        memoryVehicles[idx].is_deleted = 1;
        auditLog({ userId: req.user?.id, username: req.user?.username, action: 'delete', module: 'vehicles', description: `删除车辆(内存) ID=${id}`, ip: req.ip }).catch(() => {});
        res.json(success(null, '删除成功(内存模式)'));
        return;
      }

      const { id } = req.params;

      if (!id || isNaN(id)) {
        return res.json(error(-1, '参数错误：ID必须为数字'));
      }

      const existResult = await pool.query(
        'SELECT id FROM vehicles WHERE id = $1 AND is_deleted = false',
        [id]
      );
      if (existResult.rows.length === 0) {
        return res.json(error(-2, '车辆不存在或已删除'));
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        await client.query('UPDATE vehicles SET is_deleted = true WHERE id = $1', [id]);
        await client.query('UPDATE insurance_history SET is_deleted = true WHERE vehicle_id = $1', [id]);

        await client.query('COMMIT');
        auditLog({ userId: req.user?.id, username: req.user?.username, action: 'delete', module: 'vehicles', description: `删除车辆 ID=${id}`, ip: req.ip }).catch(() => {});
        res.json(success(null, '删除成功'));
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      next(err);
    }
  }

  async expiring(req, res, next) {
    try {
      if (!isConnected()) {
        initMemoryData();
        const { days = 60, status = 'all' } = req.query;
        const daysNum = parseInt(days) || 60;

        let data = memoryVehicles.filter(v => !v.is_deleted && v.insurance_end);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        data = data.map(v => {
          const end = new Date(v.insurance_end);
          const daysToExpire = Math.ceil((end - today) / 86400000);
          let alertLevel = '提醒';
          if (daysToExpire < 0) alertLevel = '已脱保';
          else if (daysToExpire <= 7) alertLevel = '紧急';
          else if (daysToExpire <= 30) alertLevel = '预警';
          return { ...v, days_to_expire: daysToExpire, alert_level: alertLevel };
        }).filter(v => v.days_to_expire <= daysNum);

        if (status === 'expired') data = data.filter(v => v.days_to_expire < 0);
        else if (status === 'expiring') data = data.filter(v => v.days_to_expire >= 0);

        data.sort((a, b) => a.days_to_expire - b.days_to_expire);

        const total = data.length;
        const expiredCount = data.filter(r => r.days_to_expire < 0).length;
        const expiringCount = total - expiredCount;

        res.json(success({ list: data, total, expiredCount, expiringCount, days: daysNum }, '查询成功(内存模式)'));
        return;
      }

      const { days = 60, status = 'all' } = req.query;
      const daysNum = parseInt(days) || 60;

      let whereSql = `
        WHERE v.is_deleted = false
          AND v.insurance_end IS NOT NULL
          AND (v.insurance_end::date - CURRENT_DATE) <= $1
      `;
      const params = [daysNum];

      if (status === 'expired') {
        whereSql += ' AND (v.insurance_end::date - CURRENT_DATE) < 0';
      } else if (status === 'expiring') {
        whereSql += ' AND (v.insurance_end::date - CURRENT_DATE) >= 0';
      }

      const sql = `
        SELECT v.id, v.plate, v.vin, v.model, v.owner,
               v.insurance_type, v.insurance_start, v.insurance_end,
               v.premium, v.status,
               (v.insurance_end::date - CURRENT_DATE) AS days_to_expire,
               CASE
                 WHEN (v.insurance_end::date - CURRENT_DATE) < 0 THEN '已脱保'
                 WHEN (v.insurance_end::date - CURRENT_DATE) <= 7 THEN '紧急'
                 WHEN (v.insurance_end::date - CURRENT_DATE) <= 30 THEN '预警'
                 ELSE '提醒'
               END AS alert_level
        FROM vehicles v
        ${whereSql}
        ORDER BY days_to_expire ASC
      `;

      const result = await pool.query(sql, params);

      const rows = result.rows;
      const total = rows.length;
      const expiredCount = rows.filter(r => r.days_to_expire < 0).length;
      const expiringCount = total - expiredCount;

      res.json(success({
        list: rows,
        total,
        expiredCount,
        expiringCount,
        days: daysNum
      }, '查询成功'));
    } catch (err) {
      next(err);
    }
  }

  // ========== 7. Excel批量导入 ==========
  async importExcel(req, res, next) {
    try {
      if (!isConnected()) {
        return res.json(error(-5, '内存模式不支持Excel导入，请连接数据库后重试'));
      }

      if (!req.file) {
        return res.json(error(-1, '请上传Excel文件'));
      }

      const filePath = req.file.path;

      try {
        const { headers, rows, totalRows } = ExcelUtils.readFile(filePath);

        if (totalRows === 0) {
          await deleteFile(filePath);
          return res.json(error(-2, 'Excel文件无有效数据'));
        }

        const aliasMap = ExcelUtils.vehicleAliases;
        const fieldsConfig = ExcelUtils.vehicleFieldsConfig;
        const mapping = ExcelUtils.mapHeaders(headers, aliasMap);

        if (!mapping.plate) {
          await deleteFile(filePath);
          return res.json(error(-3, '未找到"车牌号"列，请检查表头'));
        }

        let successCount = 0;
        let failCount = 0;
        const failList = [];

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            try {
              const cleanResult = ExcelUtils.cleanRow(row, mapping, fieldsConfig);
              if (!cleanResult.valid) {
                failCount++;
                failList.push({ row: rowNum, reason: cleanResult.error });
                continue;
              }

              const data = cleanResult.data;
              const plate = data.plate;

              if (!plate) {
                failCount++;
                failList.push({ row: rowNum, reason: '车牌号为空' });
                continue;
              }

              const existResult = await client.query(
                'SELECT id FROM vehicles WHERE plate = $1 AND is_deleted = false',
                [plate]
              );

              if (existResult.rows.length > 0) {
                const vehicleId = existResult.rows[0].id;
                const updateFields = [];
                const updateValues = [];
                let pIdx = 0;

                for (const key of Object.keys(data)) {
                  if (key === 'plate') continue;
                  if (data[key] !== undefined && data[key] !== null) {
                    pIdx++;
                    updateFields.push(`${key} = $${pIdx}`);
                    updateValues.push(data[key]);
                  }
                }

                if (updateFields.length > 0) {
                  pIdx++;
                  updateValues.push(vehicleId);
                  await client.query(`UPDATE vehicles SET ${updateFields.join(', ')} WHERE id = $${pIdx}`, updateValues);
                }

                if (data.insurance_start && data.insurance_end) {
                  const currentHistResult = await client.query(
                    'SELECT id FROM insurance_history WHERE vehicle_id = $1 AND is_current = true AND is_deleted = false',
                    [vehicleId]
                  );
                  if (currentHistResult.rows.length > 0) {
                    await client.query(
                      `UPDATE insurance_history SET insurance_type = $1, start_date = $2, end_date = $3, premium = $4 WHERE id = $5`,
                      [data.insurance_type, data.insurance_start, data.insurance_end, data.premium || 0, currentHistResult.rows[0].id]
                    );
                  } else {
                    await client.query(
                      `INSERT INTO insurance_history (vehicle_id, plate, insurance_type, start_date, end_date, premium, is_current)
                       VALUES ($1, $2, $3, $4, $5, $6, true)`,
                      [vehicleId, plate, data.insurance_type, data.insurance_start, data.insurance_end, data.premium || 0]
                    );
                  }
                }
              } else {
                const insertResult = await client.query(
                  `INSERT INTO vehicles
                   (plate, vin, engine_no, reg_date, model, owner, insurance_type,
                    insurance_start, insurance_end, premium, vehicle_type, status, remark)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                   RETURNING id`,
                  [
                    plate, data.vin, data.engine_no, data.reg_date, data.model,
                    data.owner, data.insurance_type, data.insurance_start,
                    data.insurance_end, data.premium || 0, data.vehicle_type,
                    data.status || '在用', data.remark
                  ]
                );

                const vehicleId = insertResult.rows[0].id;

                if (data.insurance_start && data.insurance_end) {
                  await client.query(
                    `INSERT INTO insurance_history (vehicle_id, plate, insurance_type, start_date, end_date, premium, is_current)
                     VALUES ($1, $2, $3, $4, $5, $6, true)`,
                    [vehicleId, plate, data.insurance_type, data.insurance_start, data.insurance_end, data.premium || 0]
                  );
                }
              }

              successCount++;
            } catch (rowErr) {
              failCount++;
              failList.push({ row: rowNum, reason: rowErr.message });
            }
          }

          await client.query('COMMIT');
          auditLog({ userId: req.user?.id, username: req.user?.username, action: 'import', module: 'vehicles', description: `导入车辆 ${successCount}/${totalRows}`, ip: req.ip }).catch(() => {});

          res.json(success({
            total: totalRows,
            successCount,
            failCount,
            failList
          }, '导入完成'));
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      } finally {
        await deleteFile(filePath);
      }
    } catch (err) {
      next(err);
    }
  }

  // ========== 8. Excel导出车辆列表 ==========
  async exportExcel(req, res, next) {
    try {
      if (!isConnected()) {
        initMemoryData();
        let data = memoryVehicles.filter(v => !v.is_deleted);
        const { keyword = '', insuranceType = '', status = '' } = req.query;

        if (keyword) {
          const kw = keyword.toLowerCase();
          data = data.filter(v =>
            v.plate.toLowerCase().includes(kw) ||
            (v.vin && v.vin.toLowerCase().includes(kw)) ||
            (v.model && v.model.toLowerCase().includes(kw)) ||
            (v.owner && v.owner.toLowerCase().includes(kw))
          );
        }
        if (insuranceType) data = data.filter(v => v.insurance_type === insuranceType);
        if (status) data = data.filter(v => v.status === status);

        const columns = ExcelUtils.vehicleExportColumns;
        const workbook = ExcelUtils.generateExcel(data, columns, '车辆保险清单');
        const buffer = ExcelUtils.toBuffer(workbook);

        const filename = `车辆保险清单_${new Date().toISOString().split('T')[0]}.xlsx`;
        const encodedFilename = encodeURIComponent(filename);

        auditLog({ userId: req.user?.id, username: req.user?.username, action: 'export', module: 'vehicles', description: `导出车辆列表(内存)`, ip: req.ip }).catch(() => {});
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
        res.setHeader('Content-Length', buffer.length);
        res.send(buffer);
        return;
      }

      const {
        keyword = '',
        insuranceType = '',
        status = '',
        sortBy = 'id',
        sortOrder = 'DESC'
      } = req.query;

      const allowedSort = ['id', 'plate', 'reg_date', 'insurance_end', 'premium'];
      const actualSort = allowedSort.includes(sortBy) ? sortBy : 'id';
      const actualOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      let whereSql = ' WHERE v.is_deleted = false';
      const params = [];
      let paramIdx = 0;

      if (keyword) {
        paramIdx++;
        whereSql += ` AND (v.plate ILIKE $${paramIdx} OR v.vin ILIKE $${paramIdx} OR v.model ILIKE $${paramIdx} OR v.owner ILIKE $${paramIdx})`;
        params.push(`%${keyword}%`);
      }

      if (insuranceType) {
        paramIdx++;
        whereSql += ` AND v.insurance_type = $${paramIdx}`;
        params.push(insuranceType);
      }

      if (status) {
        paramIdx++;
        whereSql += ` AND v.status = $${paramIdx}`;
        params.push(status);
      }

      if (expiringDays && !isNaN(expiringDays)) {
        const days = parseInt(expiringDays);
        paramIdx++;
        whereSql += ` AND v.insurance_end IS NOT NULL AND (v.insurance_end::date - CURRENT_DATE) <= $${paramIdx}`;
        params.push(days);
      }

      const sql = `
        SELECT v.id, v.plate, v.vin, v.engine_no, v.reg_date, v.model, v.owner,
               v.insurance_type, v.insurance_start, v.insurance_end,
               v.premium, v.vehicle_type, v.status, v.remark,
               (v.insurance_end::date - CURRENT_DATE) AS days_to_expire
        FROM vehicles v
        ${whereSql}
        ORDER BY v.${actualSort} ${actualOrder}
      `;

      const result = await pool.query(sql, params);
      const rows = result.rows;

      const columns = ExcelUtils.vehicleExportColumns;
      const workbook = ExcelUtils.generateExcel(rows, columns, '车辆保险清单');
      const buffer = ExcelUtils.toBuffer(workbook);

      const filename = `车辆保险清单_${new Date().toISOString().split('T')[0]}.xlsx`;
      const encodedFilename = encodeURIComponent(filename);

      auditLog({ userId: req.user?.id, username: req.user?.username, action: 'export', module: 'vehicles', description: `导出车辆列表`, ip: req.ip }).catch(() => {});
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`);
      res.setHeader('Content-Length', buffer.length);

      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/vehicle/type-stats — 按车辆类型分组统计（前端 Dashboard 图表用）
   */
  async typeStats(_req, res, next) {
    try {
      var stats = [];
      if (isConnected()) {
        try {
          const r = await pool.query(
            "SELECT COALESCE(NULLIF(vehicle_type, ''), '其他') AS type, COUNT(*)::text AS count FROM vehicles WHERE COALESCE(is_deleted, false) = false GROUP BY vehicle_type ORDER BY COUNT(*) DESC"
          );
          stats = r.rows.map(function (row) { return { type: row.type, count: parseInt(row.count, 10) || 0 }; });
        } catch (e) { /* 回退到内存数据 */ }
      }
      if (stats.length === 0) {
        initMemoryData();  // 兜底：DB 不通或表为空时也用内存数据
        const map = new Map();
        for (const v of memoryVehicles) {
          if (v.is_deleted) continue;
          const t = v.vehicle_type || '其他';
          map.set(t, (map.get(t) || 0) + 1);
        }
        stats = Array.from(map.entries())
          .map(function ([type, count]) { return { type: type, count: count }; })
          .sort(function (a, b) { return b.count - a.count; });
      }
      res.json(success(stats, '查询成功'));
    } catch (err) {
      next(err);
    }
  }

}

module.exports = new VehiclesController();
