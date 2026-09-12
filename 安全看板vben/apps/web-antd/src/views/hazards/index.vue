<template>
  <Page auto-content-height class="hse-page">
    <div class="page-toolbar">
      <HelpButton menuCode="HSE_HAZARD_LIST" />
    </div>
    <Row v-if="statsLoading" :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="i in 6" :key="`skel-${i}`">
        <Card :bordered="false">
          <Skeleton active :paragraph="{ rows: 2 }" />
        </Card>
      </Col>
    </Row>
    <SortableStatRow v-else-if="hasVisibleStats" page-key="hazards">
      <Col :xs="24" :sm="12" :md="8" :lg="6" :xl="6" v-for="stat in statItems" :key="stat.key" class="sortable-stat-col" :data-stat-key="stat.key" v-show="isStatVisible(stat.key)">
        <HseStatCard
          :title="stat.label"
          :value="stat.value"
          :icon="stat.icon"
          :color="(stat.color as any)"
          :clickable="true"
          @click="handleStatCardClick(stat.key)"
        />
      </Col>
    </SortableStatRow>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>隐患排查治理</span>
          <Space>
            <ImportButtonGroup v-if="isActionVisible('import')" module="hazards" module-name="隐患排查治理" @refresh="fetchData" />
            <Button v-if="isActionVisible('export')" @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              导出
            </Button>
            <Button v-if="isActionVisible('create')" :type="'primary'" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              新增隐患
            </Button>
            <Button v-if="isActionVisible('statistics')" @click="showStatistics = true">
              <template #icon><IconifyIcon icon="lucide:bar-chart-3" /></template>
              统计分析
            </Button>
            <Button v-if="isActionVisible('reminders')" @click="showReminders = true">
              <template #icon><IconifyIcon icon="lucide:bell" /></template>
              隐患提醒
            </Button>
            <ComponentVisibilitySettings
              title="隐患排查显示设置"
              v-model:model-value="config"
              :stat-items="visibilityStatItems"
              :action-buttons="actionButtons"
              @reset="resetToDefault"
            />
          </Space>
        </div>
      </template>

      <Form v-if="isFilterVisible" layout="inline" class="filter-form">
        <FormItem label="关键词">
          <Input
            v-model:value="searchForm.keyword"
            placeholder="搜索隐患描述"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem label="隐患类型">
          <Select
            v-model:value="searchForm.hazardType"
            placeholder="全部"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption v-for="t in hazardTypeOptions" :key="t.value" :value="t.value">{{ t.label }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="风险等级">
          <Select
            v-model:value="searchForm.riskLevel"
            placeholder="全部"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="重大">重大</SelectOption>
            <SelectOption value="一级">一级</SelectOption>
            <SelectOption value="二级">二级</SelectOption>
            <SelectOption value="三级">三级</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="状态">
          <Select
            v-model:value="searchForm.status"
            placeholder="全部"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="discovered">发现</SelectOption>
            <SelectOption value="processing">整改中</SelectOption>
            <SelectOption value="pending_review">待复查</SelectOption>
            <SelectOption value="closed">关闭</SelectOption>
          </Select>
        </FormItem>
        <FormItem label="检查时间">
          <RangePicker
            v-model:value="dateRange"
            :placeholder="['开始日期', '结束日期']"
            @change="handleDateChange"
          />
        </FormItem>
        <FormItem>
          <Button @click="handleReset">重置</Button>
        </FormItem>
      </Form>

      <Table
        ref="tableRef"
        :columns="tableColumns"
        :data-source="dataList"
        :loading="loading"
        :pagination="{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条记录`,
        }"
        :row-key="(record) => record.id"
        @change="handleTableChange"
        size="middle"
        :scroll="{ x: 1400 }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">
              {{ getStatusLabel(record.status) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'riskLevel'">
            <Tag :color="getRiskLevelColor(record.riskLevel)">{{ record.riskLevel || '-' }}</Tag>
          </template>
          <template v-else-if="column.key === 'expiryStatus'">
            <Badge
              :status="getExpiryBadgeStatus(record.expiryStatus)"
              :text="getExpiryBadgeText(record.expiryStatus)"
            />
          </template>
          <template v-else-if="column.key === 'description'">
            <span class="cell-ellipsis" :title="record.description">{{ record.description }}</span>
          </template>
          <template v-else-if="column.key === 'rectification'">
            <span class="cell-ellipsis" :title="record.rectification">{{ record.rectification || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'checkDate'">
            {{ formatDate(record.checkDate) }}
          </template>
          <template v-else-if="column.key === 'fixDate'">
            {{ formatDate(record.fixDate) }}
          </template>
          <template v-else-if="column.key === 'rectifyDate'">
            {{ formatDate(record.rectifyDate) }}
          </template>
          <template v-else-if="column.key === 'reviewDate'">
            {{ formatDate(record.reviewDate) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Space>
              <Button :type="'link'" size="small" @click="handleView(record as any)">查看</Button>
              <Button :type="'link'" size="small" @click="handleEdit(record as any)">编辑</Button>
              <Button v-if="record.status === 'discovered'" :type="'link'" size="small" @click="handleRectify(record as any)">整改</Button>
              <Button v-if="record.status === 'processing'" :type="'link'" size="small" @click="handleSubmitReview(record as any)">提交复查</Button>
              <Button v-if="record.status === 'pending_review'" :type="'link'" size="small" @click="handleReview(record as any)">复查确认</Button>
              <Button v-if="record.status !== 'closed'" :type="'link'" size="small" danger @click="handleClose(record as any)">关闭</Button>
              <Popconfirm
                title="确定要删除吗？"
                ok-type="danger"
                @confirm="handleDelete(record as any)"
              >
                <Button :type="'link'" size="small" danger>
                  删除
                </Button>
              </Popconfirm>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingHazard ? '编辑隐患' : '新增隐患'"
      :confirm-loading="modalLoading"
      width="800px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="hazardForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="12">
            <FormItem label="隐患类型" name="hazardType">
              <Select v-model:value="hazardForm.hazardType" placeholder="请选择" style="width: 100%">
                <SelectOption v-for="t in hazardTypeOptions" :key="t.value" :value="t.value">{{ t.label }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="风险等级" name="riskLevel">
              <Select v-model:value="hazardForm.riskLevel" placeholder="请选择" style="width: 100%">
                <SelectOption value="重大">重大</SelectOption>
                <SelectOption value="一级">一级</SelectOption>
                <SelectOption value="二级">二级</SelectOption>
                <SelectOption value="三级">三级</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="隐患描述" name="description">
              <Input.TextArea v-model:value="hazardForm.description" :rows="3" placeholder="请输入隐患描述" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="整改措施" name="measure">
              <Input.TextArea v-model:value="hazardForm.measure" :rows="2" placeholder="请输入整改措施" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="检查时间" name="checkDate">
              <DatePicker v-model:value="hazardForm.checkDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="整改期限(天)" name="deadlineDays">
              <InputNumber v-model:value="hazardForm.deadlineDays" :min="1" :max="365" placeholder="默认30天" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="发现人" name="finderId">
              <EmployeeSelector v-model:value="hazardForm.finderId" placeholder="选择发现人" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="责任人" name="responsibleId">
              <EmployeeSelector v-model:value="hazardForm.responsibleId" placeholder="选择责任人" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="整改人" name="correctorId">
              <EmployeeSelector v-model:value="hazardForm.correctorId" placeholder="选择整改人" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="复查人" name="reviewerId">
              <EmployeeSelector v-model:value="hazardForm.reviewerId" placeholder="选择复查人" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="隐患位置" name="location">
              <Input v-model:value="hazardForm.location" placeholder="请输入隐患位置" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="检查人员" name="checkerId">
              <EmployeeSelector v-model:value="hazardForm.checkerId" mode="single" placeholder="选择检查人员" @change="onCheckerChange" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="整改人员" name="fixerId">
              <EmployeeSelector v-model:value="hazardForm.fixerId" mode="single" placeholder="选择整改人员" @change="onFixerChange" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="整改时间" name="fixDate">
              <DatePicker v-model:value="hazardForm.fixDate" style="width: 100%" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="整改结果" name="rectification">
              <Input.TextArea v-model:value="hazardForm.rectification" :rows="2" placeholder="请输入整改结果" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="备注" name="remark">
              <Input.TextArea v-model:value="hazardForm.remark" :rows="2" placeholder="备注说明" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Modal
      v-model:open="rectifyModalVisible"
      title="整改提交"
      :confirm-loading="rectifyLoading"
      width="640px"
      @ok="handleConfirmRectify"
      @cancel="rectifyModalVisible = false"
    >
      <Form ref="rectifyFormRef" :model="rectifyForm" :rules="(rectifyFormRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="整改人" name="correctorId">
              <EmployeeSelector v-model:value="rectifyForm.correctorId" placeholder="选择整改人" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="整改结果" name="rectification">
              <Input.TextArea v-model:value="rectifyForm.rectification" :rows="3" placeholder="请输入整改结果描述" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="整改日期" name="rectifyDate">
              <DatePicker v-model:value="rectifyForm.rectifyDate" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Modal
      v-model:open="reviewModalVisible"
      title="复查确认"
      :confirm-loading="reviewLoading"
      width="640px"
      @ok="handleConfirmReview"
      @cancel="reviewModalVisible = false"
    >
      <Form ref="reviewFormRef" :model="reviewForm" :rules="(reviewFormRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="复查人" name="reviewerId">
              <EmployeeSelector v-model:value="reviewForm.reviewerId" placeholder="选择复查人" />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="复查结果" name="reviewResult">
              <Radio.Group v-model:value="reviewForm.reviewResult">
                <Radio value="pass">合格（关闭隐患）</Radio>
                <Radio value="fail">不合格（重新整改）</Radio>
              </Radio.Group>
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem label="复查意见" name="reviewNote">
              <Input.TextArea v-model:value="reviewForm.reviewNote" :rows="3" placeholder="请输入复查意见" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem label="复查日期" name="reviewDate">
              <DatePicker v-model:value="reviewForm.reviewDate" style="width: 100%" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Modal
      v-model:open="closeModalVisible"
      title="关闭隐患"
      :confirm-loading="closeLoading"
      width="520px"
      @ok="handleConfirmClose"
      @cancel="closeModalVisible = false"
    >
      <Form :model="closeForm" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem label="关闭说明">
              <Input.TextArea v-model:value="closeForm.closeNote" :rows="3" placeholder="请输入关闭说明" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer v-model:open="detailDrawerVisible" title="隐患详情" width="720px">
      <template v-if="currentHazard">
        <Tabs v-model:activeKey="detailActiveTab">
          <Tabs.TabPane key="info" tab="基本信息">
            <Descriptions :column="1" bordered size="small">
              <DescriptionsItem label="隐患类型">{{ currentHazard.hazardType || '-' }}</DescriptionsItem>
              <DescriptionsItem label="风险等级">
                <Tag :color="getRiskLevelColor(currentHazard.riskLevel)">{{ currentHazard.riskLevel || '-' }}</Tag>
              </DescriptionsItem>
              <DescriptionsItem label="隐患状态">
                <Tag :color="getStatusColor(currentHazard.status)">{{ getStatusLabel(currentHazard.status) }}</Tag>
              </DescriptionsItem>
              <DescriptionsItem label="隐患描述">{{ currentHazard.description }}</DescriptionsItem>
              <DescriptionsItem label="整改措施">{{ currentHazard.measure }}</DescriptionsItem>
              <DescriptionsItem label="隐患位置">{{ currentHazard.location || '-' }}</DescriptionsItem>
              <DescriptionsItem label="检查时间">{{ formatDate(currentHazard.checkDate) }}</DescriptionsItem>
              <DescriptionsItem label="整改期限">{{ currentHazard.deadlineDays || 30 }}天</DescriptionsItem>
              <DescriptionsItem label="发现人">
                <EmployeeName v-if="currentHazard.finderId" :employee-id="(currentHazard.finderId as number)" />
                <span v-else>-</span>
              </DescriptionsItem>
              <DescriptionsItem label="检查人员">
                <EmployeeName v-if="(currentHazard as any).checkerId" :employee-id="(currentHazard as any).checkerId" />
                <span v-else>{{ currentHazard.checker || '-' }}</span>
              </DescriptionsItem>
              <DescriptionsItem label="责任人">
                <EmployeeName v-if="currentHazard.responsibleId" :employee-id="(currentHazard.responsibleId as number)" />
                <span v-else>-</span>
              </DescriptionsItem>
              <DescriptionsItem label="整改人员">
                <EmployeeName v-if="(currentHazard as any).fixerId" :employee-id="(currentHazard as any).fixerId" />
                <span v-else>{{ currentHazard.fixer || '-' }}</span>
              </DescriptionsItem>
              <DescriptionsItem label="整改人">
                <EmployeeName v-if="currentHazard.correctorId" :employee-id="(currentHazard.correctorId as number)" />
                <span v-else>-</span>
              </DescriptionsItem>
              <DescriptionsItem label="复查人">
                <EmployeeName v-if="currentHazard.reviewerId" :employee-id="(currentHazard.reviewerId as number)" />
                <span v-else>-</span>
              </DescriptionsItem>
              <DescriptionsItem label="整改时间">{{ formatDate(currentHazard.fixDate) }}</DescriptionsItem>
              <DescriptionsItem label="整改结果">{{ currentHazard.rectification || '-' }}</DescriptionsItem>
              <DescriptionsItem label="复查时间">{{ formatDate(currentHazard.reviewDate) }}</DescriptionsItem>
              <DescriptionsItem label="复查结果">
                <Tag v-if="currentHazard.reviewResult" :color="currentHazard.reviewResult === 'pass' ? 'green' : 'red'">
                  {{ currentHazard.reviewResult === 'pass' ? '合格' : '不合格' }}
                </Tag>
                <span v-else>-</span>
              </DescriptionsItem>
              <DescriptionsItem label="到期提醒">
                <Badge
                  :status="getExpiryBadgeStatus(currentHazard.expiryStatus)"
                  :text="getExpiryBadgeText(currentHazard.expiryStatus)"
                />
              </DescriptionsItem>
              <DescriptionsItem v-if="currentHazard.remark" label="备注">
                {{ currentHazard.remark }}
              </DescriptionsItem>
            </Descriptions>

            <div class="related-risk-card">
              <div class="related-risk-header">
                <IconifyIcon icon="lucide:link" />
                <span>{{ $t('hse.hazards.linkage.relatedRiskTitle') }}</span>
              </div>
              <template v-if="relatedRiskLoading">
                <Skeleton active :paragraph="{ rows: 2 }" />
              </template>
              <template v-else-if="relatedRisk">
                <div class="related-risk-body">
                  <div class="related-risk-row">
                    <span class="related-risk-label">{{ $t('hse.hazards.linkage.riskName') }}</span>
                    <a class="related-risk-link" @click="handleNavigateToRisk(relatedRisk.id)">
                      {{ relatedRisk.name }}
                    </a>
                    <Tag :color="getRiskLevelColor(relatedRisk.level)" style="margin-left: 8px">
                      {{ relatedRisk.level }}{{ $t('hse.riskControl.riskSuffix') }}
                    </Tag>
                  </div>
                  <div class="related-risk-row">
                    <span class="related-risk-label">{{ $t('hse.hazards.linkage.riskLocation') }}</span>
                    <span>{{ relatedRisk.location || '-' }}</span>
                  </div>
                  <div class="related-risk-row">
                    <span class="related-risk-label">{{ $t('hse.hazards.linkage.riskMeasures') }}</span>
                    <span>{{ relatedRisk.measures || '-' }}</span>
                  </div>
                  <div class="related-risk-row">
                    <span class="related-risk-label">{{ $t('hse.hazards.linkage.lastHazardCheck') }}</span>
                    <span>{{ formatDate(relatedRisk.lastHazardCheckDate) || '-' }}</span>
                  </div>
                  <div class="related-risk-row">
                    <span class="related-risk-label">{{ $t('hse.hazards.linkage.hazardCount') }}</span>
                    <Badge :count="relatedRisk.hazardCount || 0" :overflow-count="99" :number-style="{ backgroundColor: '#faad14' }" />
                  </div>
                  <Button :type="'link'" size="small" @click="handleNavigateToRisk(relatedRisk.id)">
                    {{ $t('hse.hazards.linkage.viewRiskDetail') }}
                    <IconifyIcon icon="lucide:arrow-right" style="margin-left: 4px" />
                  </Button>
                </div>
              </template>
              <template v-else>
                <div class="related-risk-empty">{{ $t('hse.hazards.linkage.noRelatedRisk') }}</div>
              </template>
            </div>
          </Tabs.TabPane>

          <Tabs.TabPane key="attachments" tab="附件列表">
            <div class="attachment-upload">
              <Upload
                :show-upload-list="false"
                :before-upload="handleBeforeUploadAttachment"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              >
                <Button :type="'primary'" size="small">
                  <template #icon><IconifyIcon icon="lucide:upload" /></template>
                  上传附件
                </Button>
              </Upload>
              <span class="upload-tip">支持 PDF/Word/Excel/图片，单文件不超过 10MB</span>
            </div>
            <Table
              :columns="attachmentColumns"
              :data-source="attachmentList"
              :loading="attachmentLoading"
              size="small"
              :pagination="false"
              row-key="id"
              class="mt-4"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'originalName'">
                  <a @click="handleDownloadAttachment(record as any)" class="link-text">
                    {{ record.originalName }}
                  </a>
                </template>
                <template v-else-if="column.key === 'fileSize'">
                  {{ formatFileSize(record.fileSize) }}
                </template>
                <template v-else-if="column.key === 'version'">
                  <Tag color="blue" v-if="record.isLatest">v{{ record.version }} (最新)</Tag>
                  <Tag v-else>v{{ record.version }}</Tag>
                </template>
                <template v-else-if="column.key === 'action'">
                  <Space>
                    <Button :type="'link'" size="small" @click="handleDownloadAttachment(record as any)">下载</Button>
                    <Popconfirm title="确定删除该附件？" ok-type="danger" @confirm="handleDeleteAttachment(record as any)">
                      <Button :type="'link'" size="small" danger>删除</Button>
                    </Popconfirm>
                  </Space>
                </template>
              </template>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane key="versions" tab="历史版本">
            <Table
              :columns="versionColumns"
              :data-source="versionList"
              :loading="versionLoading"
              size="small"
              :pagination="false"
              row-key="id"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'changeType'">
                  <Tag :color="getChangeTypeColor(record.changeType)">
                    {{ getChangeTypeText(record.changeType) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'createdAt'">
                  {{ formatDateTime(record.createdAt) }}
                </template>
              </template>
            </Table>
          </Tabs.TabPane>
        </Tabs>
      </template>
    </Drawer>

    <Drawer v-model:open="showStatistics" title="隐患统计分析" width="900px">
      <Tabs v-model:activeKey="statisticsActiveTab">
        <Tabs.TabPane key="overview" tab="总体概览">
          <Row :gutter="[16, 16]">
            <Col :span="8">
              <Card :bordered="false" class="stat-card">
                <div class="stat-num">{{ statsData.total }}</div>
                <div class="stat-label">隐患总数</div>
              </Card>
            </Col>
            <Col :span="8">
              <Card :bordered="false" class="stat-card">
                <div class="stat-num text-blue">{{ statsData.discovered }}</div>
                <div class="stat-label">待整改</div>
              </Card>
            </Col>
            <Col :span="8">
              <Card :bordered="false" class="stat-card">
                <div class="stat-num text-orange">{{ statsData.processing }}</div>
                <div class="stat-label">整改中</div>
              </Card>
            </Col>
            <Col :span="8">
              <Card :bordered="false" class="stat-card">
                <div class="stat-num text-cyan">{{ statsData.pendingReview }}</div>
                <div class="stat-label">待复查</div>
              </Card>
            </Col>
            <Col :span="8">
              <Card :bordered="false" class="stat-card">
                <div class="stat-num text-green">{{ statsData.closed }}</div>
                <div class="stat-label">已关闭</div>
              </Card>
            </Col>
            <Col :span="8">
              <Card :bordered="false" class="stat-card">
                <div class="stat-num text-red">{{ statsData.highRiskCount }}</div>
                <div class="stat-label">重大隐患</div>
              </Card>
            </Col>
          </Row>
        </Tabs.TabPane>
        <Tabs.TabPane key="department" tab="部门排行">
          <Table :columns="departmentColumns" :data-source="statsData.byDepartment" :pagination="false" row-key="departmentName">
            <template #bodyCell="{ column, index }">
              <template v-if="column.key === 'index'">{{ index + 1 }}</template>
            </template>
          </Table>
        </Tabs.TabPane>
        <Tabs.TabPane key="position" tab="岗位排行">
          <Table :columns="positionColumns" :data-source="statsData.byPosition" :pagination="false" row-key="positionName">
            <template #bodyCell="{ column, index }">
              <template v-if="column.key === 'index'">{{ index + 1 }}</template>
            </template>
          </Table>
        </Tabs.TabPane>
        <Tabs.TabPane key="region" tab="区域排行">
          <Table :columns="regionColumns" :data-source="statsData.byRegion" :pagination="false" row-key="region">
            <template #bodyCell="{ column, index }">
              <template v-if="column.key === 'index'">{{ index + 1 }}</template>
            </template>
          </Table>
        </Tabs.TabPane>
        <Tabs.TabPane key="repeated" tab="重复隐患">
          <Table :columns="repeatedColumns" :data-source="statsData.repeatedHazards" :pagination="false" row-key="description">
            <template #bodyCell="{ column, index }">
              <template v-if="column.key === 'index'">{{ index + 1 }}</template>
            </template>
          </Table>
        </Tabs.TabPane>
      </Tabs>
    </Drawer>

    <Drawer v-model:open="showReminders" title="隐患提醒" width="800px">
      <Tabs v-model:activeKey="reminderActiveTab">
        <Tabs.TabPane key="highRisk" tab="重大隐患">
          <Table :columns="reminderColumns" :data-source="highRiskList" :pagination="false" row-key="id">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'riskLevel'">
                <Tag color="red">{{ record.riskLevel }}</Tag>
              </template>
              <template v-if="column.key === 'status'">
                <Tag :color="getStatusColor(record.status)">{{ getStatusLabel(record.status) }}</Tag>
              </template>
            </template>
          </Table>
        </Tabs.TabPane>
        <Tabs.TabPane key="overdue" tab="超期隐患">
          <Table :columns="overdueColumns" :data-source="overdueList" :pagination="false" row-key="id">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'overdueDays'">
                <span class="text-red">{{ record.overdueDays }}天</span>
              </template>
              <template v-if="column.key === 'status'">
                <Tag :color="getStatusColor(record.status)">{{ getStatusLabel(record.status) }}</Tag>
              </template>
            </template>
          </Table>
        </Tabs.TabPane>
        <Tabs.TabPane key="responsible" tab="责任人超期统计">
          <Table :columns="responsibleColumns" :data-source="responsibleOverdueList" :pagination="false" row-key="responsibleId">
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'overdueHazards'">
                <span class="text-red">{{ record.overdueHazards }}</span>
              </template>
            </template>
          </Table>
        </Tabs.TabPane>
      </Tabs>
    </Drawer>

  </Page>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, nextTick, computed } from 'vue';
import { Button, Card, Col, DatePicker, Descriptions, DescriptionsItem, Drawer, Form, FormItem, Input, InputNumber, Modal, Popconfirm, Radio, Row, Select, SelectOption, Skeleton, Space, Table, Tabs, Tag, Badge, Upload, message } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { $t } from '#/locales';

import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import SortableStatRow from '#/components/hse/SortableStatRow.vue';
import ComponentVisibilitySettings from '#/components/hse/ComponentVisibilitySettings.vue';
import { useTableColumnSettings } from '#/composables/useTableColumnSettings';
import { useComponentVisibility } from '#/composables/useComponentVisibility';

import {
  getHazardList,
  getHazardStats,
  createHazard,
  updateHazard,
  deleteHazard,
  getHazardAttachments,
  uploadHazardAttachment,
  deleteHazardAttachment,
  getHazardVersions,
  exportHazards,
  getRelatedRisk,
  rectifyHazard,
  submitReviewHazard,
  reviewHazard,
  closeHazard,
  getHighRiskReminders,
  getOverdueReminders,
  getResponsibleOverdueAnalysis,
  type InsuranceApi,
  type HazardAttachment,
  type HazardVersionRecord,
  type HazardStatsEnhanced,
} from '#/api/hse/insurance';
import EmployeeSelector from '#/components/hse/EmployeeSelector.vue';
import { EmployeeName, useSearchForm, useDataTable } from '#/composables/hse';
import { useRouter } from 'vue-router';

const RangePicker = DatePicker.RangePicker;

const {
  loading,
  dataList,
  total,
  pagination,
  fetchData,
  handleTableChange,
  handleReset: tableHandleReset,
} = useDataTable<InsuranceApi.HazardItem>({
  fetchFn: async ({ page, pageSize }) => {
    const params: any = {
      page,
      pageSize,
      keyword: searchForm.keyword || undefined,
      hazardType: searchForm.hazardType,
      riskLevel: searchForm.riskLevel,
      status: searchForm.status,
      startDate: searchForm.startDate,
      endDate: searchForm.endDate,
    };
    const res = await getHazardList(params);
    void fetchStats();
    return { list: res.list || [], total: res.total || 0 };
  },
  defaultPageSize: 10,
});

const { form: searchForm, reset: resetSearch } = useSearchForm<{
  keyword: string;
  hazardType: string | undefined;
  riskLevel: string | undefined;
  status: string | undefined;
  startDate: string | undefined;
  endDate: string | undefined;
}>({
  defaults: {
    keyword: '',
    hazardType: undefined,
    riskLevel: undefined,
    status: undefined,
    startDate: undefined,
    endDate: undefined,
  },
  onSearch: () => tableHandleReset(),
});

const dateRange = ref<[Dayjs, Dayjs] | undefined>(undefined);

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingHazard = ref<InsuranceApi.HazardItem | null>(null);
const hazardForm = reactive({
  description: '',
  measure: '',
  checkDate: undefined as Dayjs | undefined,
  checker: '',
  fixer: '',
  checkerId: undefined as number | undefined,
  fixerId: undefined as number | undefined,
  fixDate: undefined as Dayjs | undefined,
  remark: '',
  finderId: undefined as number | undefined,
  responsibleId: undefined as number | undefined,
  correctorId: undefined as number | undefined,
  reviewerId: undefined as number | undefined,
  hazardType: undefined as string | undefined,
  riskLevel: undefined as string | undefined,
  location: '',
  rectification: '',
  deadlineDays: 30,
});

const formRef = ref();
const formRules = {
  description: [{ required: true, message: '请输入隐患描述', trigger: 'blur' }],
  measure: [{ required: true, message: '请输入整改措施', trigger: 'blur' }],
  checkDate: [{ required: true, message: '请选择检查时间', trigger: 'change' }],
};

const detailDrawerVisible = ref(false);
const currentHazard = ref<InsuranceApi.HazardItem | null>(null);
const detailActiveTab = ref('info');

const router = useRouter();
const relatedRisk = ref<InsuranceApi.RelatedRisk | null>(null);
const relatedRiskLoading = ref(false);

const attachmentList = ref<HazardAttachment[]>([]);
const attachmentLoading = ref(false);
const attachmentColumns = ref([
  { title: '文件名', key: 'originalName', dataIndex: 'originalName' },
  { title: '版本', key: 'version', width: 140, align: 'center' as const },
  { title: '大小', key: 'fileSize', width: 100, align: 'center' as const },
  { title: '上传人', key: 'uploadedBy', dataIndex: 'uploadedBy', width: 100 },
  { title: '操作', key: 'action', width: 120, align: 'center' as const },
]);

const versionList = ref<HazardVersionRecord[]>([]);
const versionLoading = ref(false);
const versionColumns = ref([
  { title: '版本号', key: 'version', dataIndex: 'version', width: 100 },
  { title: '变更类型', key: 'changeType', width: 100, align: 'center' as const },
  { title: '变更说明', key: 'changeSummary', dataIndex: 'changeSummary' },
  { title: '操作人', key: 'changedBy', dataIndex: 'changedBy', width: 100 },
  { title: '变更时间', key: 'createdAt', width: 170 },
]);

const statsData = reactive<HazardStatsEnhanced>({
  total: 0,
  discovered: 0,
  processing: 0,
  pendingReview: 0,
  closed: 0,
  highRiskCount: 0,
  overdueCount: 0,
  byDepartment: [],
  byPosition: [],
  byRegion: [],
  repeatedHazards: [],
});

const statsLoading = ref(false);

const statItems = computed(() => [
  { key: 'total', label: '隐患总数', value: statsData.total, icon: 'lucide:bar-chart-3', color: 'blue' },
  { key: 'discovered', label: '待整改', value: statsData.discovered, icon: 'lucide:alert-circle', color: 'cyan' },
  { key: 'processing', label: '整改中', value: statsData.processing, icon: 'lucide:loader', color: 'orange' },
  { key: 'pendingReview', label: '待复查', value: statsData.pendingReview, icon: 'lucide:eye', color: 'purple' },
  { key: 'closed', label: '已关闭', value: statsData.closed, icon: 'lucide:check-circle-2', color: 'green' },
  { key: 'highRisk', label: '重大隐患', value: statsData.highRiskCount, icon: 'lucide:triangle-alert', color: 'red' },
]);

const hazardTypeOptions = [
  { value: '设施设备', label: '设施设备' },
  { value: '作业环境', label: '作业环境' },
  { value: '管理体系', label: '管理体系' },
  { value: '人员行为', label: '人员行为' },
  { value: '其他', label: '其他' },
];

const originalColumns = ref([
  {
    title: '序号',
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) => (pagination.current - 1) * pagination.pageSize + index + 1,
  },
  { title: '隐患类型', key: 'hazardType', dataIndex: 'hazardType', width: 100 },
  { title: '风险等级', key: 'riskLevel', width: 90, align: 'center' as const },
  { title: '隐患描述', key: 'description', dataIndex: 'description', width: 220, ellipsis: true },
  { title: '整改措施', key: 'measure', dataIndex: 'measure', width: 150, ellipsis: true },
  { title: '整改结果', key: 'rectification', width: 150, ellipsis: true },
  { title: '检查时间', key: 'checkDate', width: 120 },
  { title: '到期提醒', key: 'expiryStatus', width: 100, align: 'center' as const },
  { title: '状态', key: 'status', width: 90, align: 'center' as const },
  { title: '操作', key: 'action', width: 350, fixed: 'right' as const },
]);

const { columns: tableColumns, initSortable, initResizable } = useTableColumnSettings(originalColumns, 'hazards');
const tableRef = ref<any>(null);

const visibilityStatItems = computed(() => statItems.value.map((s) => ({ key: s.key, label: s.label })));
const actionButtons = ref([
  { key: 'import', label: '导入数据' },
  { key: 'export', label: '导出报表' },
  { key: 'create', label: '新增隐患' },
  { key: 'statistics', label: '统计分析' },
  { key: 'reminders', label: '隐患提醒' },
]);

const { config, isStatVisible, isActionVisible, isFilterVisible, resetToDefault } = useComponentVisibility({
  pageKey: 'hazards',
  statItems: visibilityStatItems,
  actionButtons,
});

const hasVisibleStats = computed(() => statItems.value.some((s) => isStatVisible.value(s.key)));

const showStatistics = ref(false);
const statisticsActiveTab = ref('overview');
const departmentColumns = ref([
  { title: '排名', key: 'index', width: 60, align: 'center' as const },
  { title: '部门', key: 'departmentName', dataIndex: 'departmentName' },
  { title: '隐患数', key: 'total', width: 100, align: 'center' as const },
]);
const positionColumns = ref([
  { title: '排名', key: 'index', width: 60, align: 'center' as const },
  { title: '岗位', key: 'positionName', dataIndex: 'positionName' },
  { title: '隐患数', key: 'total', width: 100, align: 'center' as const },
]);
const regionColumns = ref([
  { title: '排名', key: 'index', width: 60, align: 'center' as const },
  { title: '区域', key: 'region', dataIndex: 'region' },
  { title: '隐患数', key: 'total', width: 100, align: 'center' as const },
]);
const repeatedColumns = ref([
  { title: '排名', key: 'index', width: 60, align: 'center' as const },
  { title: '隐患描述', key: 'description', dataIndex: 'description' },
  { title: '重复次数', key: 'repeatCount', width: 100, align: 'center' as const },
  { title: '首次发现', key: 'firstDiscovered', width: 120 },
  { title: '最近发现', key: 'lastDiscovered', width: 120 },
]);

const showReminders = ref(false);
const reminderActiveTab = ref('highRisk');
const highRiskList = ref<InsuranceApi.HazardItem[]>([]);
const overdueList = ref<(InsuranceApi.HazardItem & { responsibleName?: string; overdueDays?: number })[]>([]);
const responsibleOverdueList = ref<any[]>([]);

const reminderColumns = ref([
  { title: '隐患描述', key: 'description', dataIndex: 'description' },
  { title: '风险等级', key: 'riskLevel', width: 90, align: 'center' as const },
  { title: '位置', key: 'location', dataIndex: 'location', width: 120 },
  { title: '状态', key: 'status', width: 90, align: 'center' as const },
]);

const overdueColumns = ref([
  { title: '隐患描述', key: 'description', dataIndex: 'description' },
  { title: '责任人', key: 'responsibleName', dataIndex: 'responsibleName', width: 120 },
  { title: '超期天数', key: 'overdueDays', width: 100, align: 'center' as const },
  { title: '状态', key: 'status', width: 90, align: 'center' as const },
]);

const responsibleColumns = ref([
  { title: '责任人', key: 'responsibleName', dataIndex: 'responsibleName' },
  { title: '部门', key: 'department', dataIndex: 'department', width: 120 },
  { title: '岗位', key: 'position', dataIndex: 'position', width: 120 },
  { title: '隐患总数', key: 'totalHazards', width: 100, align: 'center' as const },
  { title: '已关闭', key: 'closedHazards', width: 100, align: 'center' as const },
  { title: '超期数', key: 'overdueHazards', width: 100, align: 'center' as const },
]);

const rectifyModalVisible = ref(false);
const rectifyLoading = ref(false);
const rectifyForm = reactive({
  correctorId: undefined as number | undefined,
  rectification: '',
  rectifyDate: dayjs(),
});
const rectifyFormRef = ref();
const rectifyFormRules = {
  rectification: [{ required: true, message: '请输入整改结果', trigger: 'blur' }],
};

const reviewModalVisible = ref(false);
const reviewLoading = ref(false);
const reviewForm = reactive({
  reviewerId: undefined as number | undefined,
  reviewResult: 'pass' as 'pass' | 'fail',
  reviewNote: '',
  reviewDate: dayjs(),
});
const reviewFormRef = ref();
const reviewFormRules = {
  reviewResult: [{ required: true, message: '请选择复查结果', trigger: 'change' }],
};

const closeModalVisible = ref(false);
const closeLoading = ref(false);
const closeForm = reactive({
  closeNote: '',
});

function formatDate(date?: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

function handleDateChange(_dates: any, dateStrings: [string, string]) {
  searchForm.startDate = dateStrings[0] || undefined;
  searchForm.endDate = dateStrings[1] || undefined;
  handleSearch();
}

// fetchData 已由 useDataTable 接管（见上方 useDataTable 配置），保留 fetchStats 副作用

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await getHazardStats();
    statsData.total = res.total || 0;
    statsData.discovered = res.discovered || res.unresolved || 0;
    statsData.processing = res.processing || 0;
    statsData.pendingReview = res.pendingReview || 0;
    statsData.closed = res.closed || res.resolved || 0;
    statsData.highRiskCount = res.highRiskCount || 0;
    statsData.overdueCount = res.overdueCount || 0;
    statsData.byDepartment = res.byDepartment || [];
    statsData.byPosition = res.byPosition || [];
    statsData.byRegion = res.byRegion || [];
    statsData.repeatedHazards = res.repeatedHazards || [];
  } catch (err) {
    console.warn('获取统计数据失败:', err);
  } finally {
    statsLoading.value = false;
  }
}

async function fetchReminders() {
  try {
    const [highRiskRes, overdueRes, responsibleRes] = await Promise.all([
      getHighRiskReminders(),
      getOverdueReminders(),
      getResponsibleOverdueAnalysis(),
    ]);
    highRiskList.value = highRiskRes.list || [];
    overdueList.value = overdueRes.list || [];
    responsibleOverdueList.value = responsibleRes.list || [];
  } catch (err) {
    console.warn('获取提醒数据失败:', err);
  }
}

function handleSearch() {
  tableHandleReset();
}

function handleReset() {
  dateRange.value = undefined;
  resetSearch();
}

function handleStatCardClick(key: string) {
  searchForm.keyword = '';
  dateRange.value = undefined;
  searchForm.startDate = undefined;
  searchForm.endDate = undefined;
  searchForm.hazardType = undefined;
  searchForm.riskLevel = undefined;

  switch (key) {
    case 'discovered':
      searchForm.status = 'discovered';
      break;
    case 'processing':
      searchForm.status = 'processing';
      break;
    case 'pendingReview':
      searchForm.status = 'pending_review';
      break;
    case 'closed':
      searchForm.status = 'closed';
      break;
    case 'highRisk':
      searchForm.riskLevel = '重大';
      break;
    default:
      searchForm.status = undefined;
  }

  tableHandleReset();
}

// handleTableChange 已由 useDataTable 接管

function handleCreate() {
  editingHazard.value = null;
  Object.assign(hazardForm, {
    description: '',
    measure: '',
    checkDate: dayjs(),
    checker: '',
    fixer: '',
    checkerId: null,
    fixerId: null,
    fixDate: null,
    remark: '',
    finderId: null,
    responsibleId: null,
    correctorId: null,
    reviewerId: null,
    hazardType: null,
    riskLevel: null,
    location: '',
    rectification: '',
    deadlineDays: 30,
  });
  modalVisible.value = true;
}

function handleEdit(record: InsuranceApi.HazardItem) {
  editingHazard.value = record;
  Object.assign(hazardForm, {
    description: record.description,
    measure: record.measure,
    checkDate: record.checkDate ? dayjs(record.checkDate) : null,
    checker: record.checker,
    fixer: record.fixer,
    checkerId: (record as any).checkerId || null,
    fixerId: (record as any).fixerId || null,
    fixDate: record.fixDate ? dayjs(record.fixDate) : null,
    remark: record.remark || '',
    finderId: record.finderId || null,
    responsibleId: record.responsibleId || null,
    correctorId: record.correctorId || null,
    reviewerId: record.reviewerId || null,
    hazardType: record.hazardType || null,
    riskLevel: record.riskLevel || null,
    location: record.location || '',
    rectification: record.rectification || '',
    deadlineDays: record.deadlineDays || 30,
  });
  modalVisible.value = true;
}

function handleView(record: InsuranceApi.HazardItem) {
  currentHazard.value = record;
  detailActiveTab.value = 'info';
  detailDrawerVisible.value = true;
  relatedRisk.value = null;
  nextTick(() => {
    fetchAttachments(record.id);
    fetchVersions(record.id);
    fetchRelatedRisk(record.id);
  });
}

async function fetchRelatedRisk(id: number) {
  relatedRiskLoading.value = true;
  try {
    const res = await getRelatedRisk(id);
    relatedRisk.value = res || null;
  } catch (err) {
    console.warn('获取关联风险点失败:', err);
    relatedRisk.value = null;
  } finally {
    relatedRiskLoading.value = false;
  }
}

function handleNavigateToRisk(riskId: number) {
  if (!riskId) return;
  detailDrawerVisible.value = false;
  router.push({
    path: '/hse/risk-control',
    query: { highlightRiskId: String(riskId) },
  });
}

async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    const res = await getHazardAttachments(id);
    attachmentList.value = res || [];
  } catch (err) {
    console.warn('获取附件列表失败:', err);
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    const res = await getHazardVersions(id);
    versionList.value = res || [];
  } catch (err) {
    console.warn('获取版本履历失败:', err);
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

function handleBeforeUploadAttachment(file: File) {
  const isLt10M = file.size / 1024 / 1024 < 10;
  if (!isLt10M) {
    message.error('文件大小不能超过 10MB');
    return false;
  }
  if (!currentHazard.value) return false;
  uploadHazardAttachment(currentHazard.value.id, file, { uploadedBy: 'admin' })
    .then(() => {
      message.success('上传成功');
      fetchAttachments(currentHazard.value!.id);
    })
    .catch((err) => {
      console.warn('上传失败:', err);
      message.error('上传失败');
    });
  return false;
}

function handleDownloadAttachment(record: HazardAttachment) {
  if (record.fileUrl) {
    window.open(record.fileUrl, '_blank');
  }
}

async function handleDeleteAttachment(record: HazardAttachment) {
  if (!currentHazard.value) return;
  try {
    await deleteHazardAttachment(currentHazard.value.id, record.id);
    message.success('删除成功');
    fetchAttachments(currentHazard.value.id);
  } catch (err) {
    console.warn('删除附件失败:', err);
    message.error('删除失败');
  }
}

function getExpiryBadgeStatus(status?: string): 'success' | 'warning' | 'error' | 'default' | 'processing' {
  switch (status) {
    case 'normal':
      return 'success';
    case 'expiring':
      return 'warning';
    case 'expired':
      return 'error';
    case 'resolved':
      return 'default';
    default:
      return 'default';
  }
}

function getExpiryBadgeText(status?: string): string {
  switch (status) {
    case 'normal':
      return '正常';
    case 'expiring':
      return '临期';
    case 'expired':
      return '过期';
    case 'resolved':
      return '已完成';
    default:
      return '未知';
  }
}

function getChangeTypeColor(type: string): string {
  switch (type) {
    case 'create':
      return 'green';
    case 'update':
      return 'blue';
    case 'import':
      return 'cyan';
    case 'revise':
      return 'orange';
    case 'delete':
      return 'red';
    default:
      return 'default';
  }
}

function getChangeTypeText(type: string): string {
  switch (type) {
    case 'create':
      return '新增';
    case 'update':
      return '更新';
    case 'import':
      return '导入';
    case 'revise':
      return '修订';
    case 'delete':
      return '删除';
    default:
      return type;
  }
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDateTime(date?: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

async function handleExport() {
  try {
    const blob = await exportHazards();
    const url = window.URL.createObjectURL(new Blob([blob]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `隐患清单_${dayjs().format('YYYYMMDD')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    message.success('导出成功');
  } catch (err) {
    console.warn('导出失败:', err);
    message.error('导出失败');
  }
}

function onCheckerChange(item: any) {
  hazardForm.checker = item?.name ?? '';
}

function onFixerChange(item: any) {
  hazardForm.fixer = item?.name ?? '';
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  modalLoading.value = true;
  try {
    const data: any = {
      description: hazardForm.description,
      measure: hazardForm.measure,
      checkDate: hazardForm.checkDate?.format('YYYY-MM-DD'),
      checker: hazardForm.checker,
      fixer: hazardForm.fixer,
      checkerId: hazardForm.checkerId,
      fixerId: hazardForm.fixerId,
      fixDate: hazardForm.fixDate?.format('YYYY-MM-DD') || null,
      remark: hazardForm.remark,
      finderId: hazardForm.finderId,
      responsibleId: hazardForm.responsibleId,
      correctorId: hazardForm.correctorId,
      reviewerId: hazardForm.reviewerId,
      hazardType: hazardForm.hazardType,
      riskLevel: hazardForm.riskLevel,
      location: hazardForm.location,
      rectification: hazardForm.rectification,
      deadlineDays: hazardForm.deadlineDays,
    };
    if (editingHazard.value) {
      await updateHazard(editingHazard.value.id, data);
      message.success('更新成功');
    } else {
      await createHazard(data);
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error('保存失败');
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: InsuranceApi.HazardItem) {
  try {
    await deleteHazard(record.id);
    message.success('删除成功');
    fetchData();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error('删除失败');
  }
}

function getStatusLabel(status?: string): string {
  switch (status) {
    case 'discovered':
      return '发现';
    case 'processing':
      return '整改中';
    case 'pending_review':
      return '待复查';
    case 'closed':
      return '关闭';
    default:
      return status || '-';
  }
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'discovered':
      return 'blue';
    case 'processing':
      return 'orange';
    case 'pending_review':
      return 'purple';
    case 'closed':
      return 'green';
    default:
      return 'default';
  }
}

function getRiskLevelColor(level?: string | null): string {
  if (!level) return 'default';
  if (level === '重大' || level === '一级') return 'red';
  if (level === '二级') return 'orange';
  if (level === '三级') return 'yellow';
  return 'blue';
}

function handleRectify(record: InsuranceApi.HazardItem) {
  currentHazard.value = record;
  Object.assign(rectifyForm, {
    correctorId: record.correctorId || null,
    rectification: '',
    rectifyDate: dayjs(),
  });
  rectifyModalVisible.value = true;
}

async function handleConfirmRectify() {
  try {
    await rectifyFormRef.value?.validate();
  } catch {
    return;
  }
  rectifyLoading.value = true;
  try {
    if (!currentHazard.value) return;
    await rectifyHazard(currentHazard.value.id, {
      correctorId: rectifyForm.correctorId,
      rectification: rectifyForm.rectification,
      rectifyDate: rectifyForm.rectifyDate?.format('YYYY-MM-DD'),
    });
    message.success('整改提交成功');
    rectifyModalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('整改失败:', err);
    message.error('整改失败');
  } finally {
    rectifyLoading.value = false;
  }
}

function handleSubmitReview(record: InsuranceApi.HazardItem) {
  currentHazard.value = record;
  submitReviewHazard(record.id)
    .then(() => {
      message.success('提交复查成功');
      fetchData();
    })
    .catch((err) => {
      console.warn('提交复查失败:', err);
      message.error('提交复查失败');
    });
}

function handleReview(record: InsuranceApi.HazardItem) {
  currentHazard.value = record;
  Object.assign(reviewForm, {
    reviewerId: record.reviewerId || null,
    reviewResult: 'pass',
    reviewNote: '',
    reviewDate: dayjs(),
  });
  reviewModalVisible.value = true;
}

async function handleConfirmReview() {
  try {
    await reviewFormRef.value?.validate();
  } catch {
    return;
  }
  reviewLoading.value = true;
  try {
    if (!currentHazard.value) return;
    await reviewHazard(currentHazard.value.id, {
      reviewerId: reviewForm.reviewerId,
      reviewResult: reviewForm.reviewResult,
      reviewNote: reviewForm.reviewNote,
      reviewDate: reviewForm.reviewDate?.format('YYYY-MM-DD'),
    });
    message.success(`复查${reviewForm.reviewResult === 'pass' ? '合格，已关闭' : '不合格，重新整改'}`);
    reviewModalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('复查失败:', err);
    message.error('复查失败');
  } finally {
    reviewLoading.value = false;
  }
}

function handleClose(record: InsuranceApi.HazardItem) {
  currentHazard.value = record;
  closeForm.closeNote = '';
  closeModalVisible.value = true;
}

async function handleConfirmClose() {
  closeLoading.value = true;
  try {
    if (!currentHazard.value) return;
    await closeHazard(currentHazard.value.id, { closeNote: closeForm.closeNote });
    message.success('隐患关闭成功');
    closeModalVisible.value = false;
    fetchData();
  } catch (err) {
    console.warn('关闭失败:', err);
    message.error('关闭失败');
  } finally {
    closeLoading.value = false;
  }
}

async function initTableFeatures() {
  await nextTick();
  if (tableRef.value?.$el) {
    initSortable(tableRef.value.$el);
    initResizable(tableRef.value.$el);
  }
}

onMounted(async () => {
  await Promise.all([fetchStats(), fetchData()]);
  await initTableFeatures();
});

watch(showReminders, async (val) => {
  if (val) {
    await fetchReminders();
  }
});

import { watch } from 'vue';
</script>

<style scoped lang="scss">
.hse-page {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .cell-ellipsis {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-upload {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;

    .upload-tip {
      font-size: 12px;
      color: hsl(var(--muted-foreground));
    }
  }

  .link-text {
    color: hsl(var(--primary));
    cursor: pointer;
    &:hover {
      text-decoration: underline;
    }
  }

  .related-risk-card {
    margin-top: 16px;
    padding: 12px 16px;
    border: 1px solid hsl(var(--border));
    border-radius: 8px;
    background: hsl(var(--muted) / 0.3);

    .related-risk-header {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      color: hsl(var(--foreground));
      margin-bottom: 12px;
      font-size: 14px;
    }

    .related-risk-body {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  }
}
</style>

