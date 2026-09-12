<template>
  <Page auto-content-height class="hse-page">
    <Row :gutter="[16, 16]" class="mb-4">
      <template v-if="statsLoading">
        <Col class="stat-col" :xs="24" :sm="12" :md="8" :lg="4" :xl="4" v-for="i in 5" :key="`skel-${i}`">
          <Card :bordered="false">
            <Skeleton active :paragraph="{ rows: 2 }" />
          </Card>
        </Col>
      </template>
      <template v-else>
        <Col class="stat-col" :xs="24" :sm="12" :md="8" :lg="4" :xl="4" v-for="stat in statItems" :key="stat.key">
          <HseStatCard
            :title="stat.label"
            :value="stat.value"
            :icon="stat.icon"
            :color="(stat.color as any)"
            :clickable="true"
            @click="handleStatCardClick(stat.key)"
          />
        </Col>
      </template>
    </Row>

    <Card :bordered="false">
      <template #title>
        <div class="card-header">
          <span>{{ $t('hse.riskControl.title') }}</span>
          <div class="action-group">
            <Space :size="8">
              <HelpButton menuCode="HSE_RISK_CONTROL" />
              <ImportButtonGroup
                :module="'risk-control'"
                :module-name="$t('hse.riskControl.title')"
                @refresh="handleRefresh"
              />
            <Button :loading="exportLoading" @click="handleExport">
              <template #icon><IconifyIcon icon="lucide:download" /></template>
              {{ $t('hse.riskControl.action.export') }}
            </Button>
            <Button @click="mapDrawerVisible = true">
              <template #icon><IconifyIcon icon="lucide:map" /></template>
              {{ $t('hse.riskControl.riskMap') }}
            </Button>
            <Button type="primary" @click="handleCreate">
              <template #icon><IconifyIcon icon="lucide:plus" /></template>
              {{ $t('hse.riskControl.action.create') }}
            </Button>
            </Space>
          </div>
        </div>
      </template>

      <Form layout="inline" class="filter-form">
        <FormItem :label="$t('hse.riskControl.search.keyword')">
          <Input
            v-model:value="searchForm.keyword"
            :placeholder="$t('hse.riskControl.search.keywordPlaceholder')"
            allow-clear
            @change="handleSearch"
          />
        </FormItem>
        <FormItem :label="$t('hse.riskControl.search.level')">
          <Select
            v-model:value="searchForm.level"
            :placeholder="$t('hse.riskControl.search.allLevel')"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="一级">{{ $t('hse.riskControl.level.level1') }}</SelectOption>
            <SelectOption value="二级">{{ $t('hse.riskControl.level.level2') }}</SelectOption>
            <SelectOption value="三级">{{ $t('hse.riskControl.level.level3') }}</SelectOption>
            <SelectOption value="四级">{{ $t('hse.riskControl.level.level4') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="$t('hse.riskControl.search.type')">
          <Select
            v-model:value="searchForm.type"
            :placeholder="$t('hse.riskControl.search.allType')"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="机械伤害">{{ $t('hse.riskControl.type.mechanical') }}</SelectOption>
            <SelectOption value="高处坠落">{{ $t('hse.riskControl.type.falling') }}</SelectOption>
            <SelectOption value="物体打击">{{ $t('hse.riskControl.type.strike') }}</SelectOption>
            <SelectOption value="触电">{{ $t('hse.riskControl.type.electric') }}</SelectOption>
            <SelectOption value="火灾">{{ $t('hse.riskControl.type.fire') }}</SelectOption>
            <SelectOption value="爆炸">{{ $t('hse.riskControl.type.explosion') }}</SelectOption>
            <SelectOption value="中毒窒息">{{ $t('hse.riskControl.type.poisoning') }}</SelectOption>
            <SelectOption value="其他">{{ $t('hse.riskControl.type.other') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="$t('hse.riskControl.search.area')">
          <Select
            v-model:value="searchForm.area"
            :placeholder="$t('hse.riskControl.search.allArea')"
            allow-clear
            @change="handleSearch"
          >
            <SelectOption value="生产区">{{ $t('hse.riskControl.area.production') }}</SelectOption>
            <SelectOption value="仓储区">{{ $t('hse.riskControl.area.warehouse') }}</SelectOption>
            <SelectOption value="办公区">{{ $t('hse.riskControl.area.office') }}</SelectOption>
            <SelectOption value="检修区">{{ $t('hse.riskControl.area.maintenance') }}</SelectOption>
            <SelectOption value="危险品区">{{ $t('hse.riskControl.area.dangerous') }}</SelectOption>
            <SelectOption value="公共区域">{{ $t('hse.riskControl.area.public') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem :label="$t('hse.riskControl.expiry.title')">
          <Select
            v-model:value="searchForm.expiryStatus"
            :placeholder="$t('hse.riskControl.search.allExpiry')"
            allow-clear
            @change="handleSearch"
            style="width: 120px"
          >
            <SelectOption value="normal">{{ $t('hse.riskControl.expiry.normal') }}</SelectOption>
            <SelectOption value="expiring">{{ $t('hse.riskControl.expiry.expiring') }}</SelectOption>
            <SelectOption value="expired">{{ $t('hse.riskControl.expiry.expired') }}</SelectOption>
            <SelectOption value="permanent">{{ $t('hse.riskControl.expiry.permanent') }}</SelectOption>
          </Select>
        </FormItem>
        <FormItem>
          <Button @click="handleReset">{{ $t('hse.riskControl.action.reset') }}</Button>
        </FormItem>
      </Form>

      <Table
        :columns="columns"
        :data-source="riskList"
        :loading="loading"
        :pagination="{
          current: pagination.page,
          pageSize: pagination.pageSize,
          total: total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => $t('hse.riskControl.totalRecords', { total: t }),
        }"
        :row-key="(record) => record.id"
        :custom-row="handleCustomRow"
        @change="(handleTableChange as any)"
        size="middle"
        :scroll="{ x: 1700 }"
        :row-class-name="(record) => (highlightedRiskId === record.id ? 'risk-row-highlighted' : '')"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'level'">
            <Tag :color="getLevelColor(record.level)">
              {{ record.level }}{{ $t('hse.riskControl.riskSuffix') }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="getStatusColor(record.status)">
              {{ getStatusText(record.status) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'expiryStatus'">
            <Badge
              :status="getExpiryBadgeStatus(record.expiryStatus)"
              :text="getExpiryText(record.expiryStatus)"
            />
          </template>
          <template v-else-if="column.key === 'assessmentDate'">
            {{ formatDate(record.assessmentDate) }}
          </template>
          <template v-else-if="column.key === 'createdAt'">
            {{ formatDateTime(record.createdAt) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <Button type="link" size="small" @click="handleView(record as any)">
              {{ $t('hse.riskControl.action.view') }}
            </Button>
            <Button type="link" size="small" @click.stop="handleLocateOnMap(record as any)">
              <template #icon><IconifyIcon icon="lucide:map-pin" /></template>
              定位
            </Button>
            <Button type="link" size="small" @click="handleEdit(record as any)">
              {{ $t('hse.riskControl.action.edit') }}
            </Button>
            <Popconfirm
              :title="$t('hse.riskControl.action.deleteConfirm')"
              :ok-text="$t('hse.riskControl.action.confirmDelete')"
              :cancel-text="$t('hse.riskControl.action.cancel')"
              @confirm="handleDelete(record as any)"
            >
              <Button type="link" size="small" danger>
                {{ $t('hse.riskControl.action.delete') }}
              </Button>
            </Popconfirm>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="modalVisible"
      :title="editingRisk ? $t('hse.riskControl.action.editTitle') : $t('hse.riskControl.action.createTitle')"
      :confirm-loading="modalLoading"
      width="780px"
      @ok="handleSave"
      @cancel="modalVisible = false"
    >
      <Form ref="formRef" :model="riskForm" :rules="(formRules as any)" layout="vertical">
        <Row :gutter="16">
          <Col :span="24">
            <FormItem :label="$t('hse.riskControl.form.name')" required>
              <Input
                v-model:value="riskForm.name"
                :placeholder="$t('hse.riskControl.form.namePlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem :label="$t('hse.riskControl.form.level')" required>
              <Select v-model:value="riskForm.level" :placeholder="$t('hse.riskControl.form.levelPlaceholder')" style="width: 100%">
                <SelectOption value="一级">{{ $t('hse.riskControl.level.level1') }}</SelectOption>
                <SelectOption value="二级">{{ $t('hse.riskControl.level.level2') }}</SelectOption>
                <SelectOption value="三级">{{ $t('hse.riskControl.level.level3') }}</SelectOption>
                <SelectOption value="四级">{{ $t('hse.riskControl.level.level4') }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem :label="$t('hse.riskControl.form.type')">
              <Select v-model:value="riskForm.type" :placeholder="$t('hse.riskControl.form.typePlaceholder')" style="width: 100%">
                <SelectOption value="机械伤害">{{ $t('hse.riskControl.type.mechanical') }}</SelectOption>
                <SelectOption value="高处坠落">{{ $t('hse.riskControl.type.falling') }}</SelectOption>
                <SelectOption value="物体打击">{{ $t('hse.riskControl.type.strike') }}</SelectOption>
                <SelectOption value="触电">{{ $t('hse.riskControl.type.electric') }}</SelectOption>
                <SelectOption value="火灾">{{ $t('hse.riskControl.type.fire') }}</SelectOption>
                <SelectOption value="爆炸">{{ $t('hse.riskControl.type.explosion') }}</SelectOption>
                <SelectOption value="中毒窒息">{{ $t('hse.riskControl.type.poisoning') }}</SelectOption>
                <SelectOption value="其他">{{ $t('hse.riskControl.type.other') }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="8">
            <FormItem :label="$t('hse.riskControl.form.status')">
              <Select v-model:value="riskForm.status" :placeholder="$t('hse.riskControl.form.statusPlaceholder')" style="width: 100%">
                <SelectOption value="正常">{{ $t('hse.riskControl.status.normal') }}</SelectOption>
                <SelectOption value="已处置">{{ $t('hse.riskControl.status.resolved') }}</SelectOption>
                <SelectOption value="监控中">{{ $t('hse.riskControl.status.monitoring') }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.riskControl.form.location')">
              <Input v-model:value="riskForm.location" :placeholder="$t('hse.riskControl.form.locationPlaceholder')" />
            </FormItem>
          </Col>
          <Col :span="6">
            <FormItem :label="$t('hse.riskControl.form.lng')">
              <InputNumber
                v-model:value="riskForm.lng"
                placeholder="116.xxxxx"
                style="width: 100%"
                :precision="6"
                :step="0.0001"
              />
            </FormItem>
          </Col>
          <Col :span="6">
            <FormItem :label="$t('hse.riskControl.form.lat')">
              <InputNumber
                v-model:value="riskForm.lat"
                placeholder="37.xxxxx"
                style="width: 100%"
                :precision="6"
                :step="0.0001"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.riskControl.form.area')">
              <Select v-model:value="riskForm.area" :placeholder="$t('hse.riskControl.form.areaPlaceholder')" style="width: 100%">
                <SelectOption value="生产区">{{ $t('hse.riskControl.area.production') }}</SelectOption>
                <SelectOption value="仓储区">{{ $t('hse.riskControl.area.warehouse') }}</SelectOption>
                <SelectOption value="办公区">{{ $t('hse.riskControl.area.office') }}</SelectOption>
                <SelectOption value="检修区">{{ $t('hse.riskControl.area.maintenance') }}</SelectOption>
                <SelectOption value="危险品区">{{ $t('hse.riskControl.area.dangerous') }}</SelectOption>
                <SelectOption value="公共区域">{{ $t('hse.riskControl.area.public') }}</SelectOption>
              </Select>
            </FormItem>
          </Col>
          <Col :span="6">
            <FormItem :label="$t('hse.riskControl.form.assessmentDate')">
              <DatePicker
                v-model:value="riskForm.assessmentDate"
                style="width: 100%"
                value-format="YYYY-MM-DD"
                :placeholder="$t('hse.riskControl.form.assessmentDatePlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="6">
            <FormItem :label="$t('hse.riskControl.form.reviewCycle')">
              <InputNumber
                v-model:value="riskForm.reviewCycle"
                :min="0"
                :max="120"
                :placeholder="$t('hse.riskControl.form.reviewCyclePlaceholder')"
                style="width: 100%"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="$t('hse.riskControl.form.measures')">
              <Textarea
                v-model:value="riskForm.measures"
                :rows="3"
                :placeholder="$t('hse.riskControl.form.measuresPlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="24">
            <FormItem :label="$t('hse.riskControl.form.emergency')">
              <Textarea
                v-model:value="riskForm.emergency"
                :rows="3"
                :placeholder="$t('hse.riskControl.form.emergencyPlaceholder')"
              />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.riskControl.form.accidentType')">
              <Input v-model:value="riskForm.accidentType" :placeholder="$t('hse.riskControl.form.accidentTypePlaceholder')" />
            </FormItem>
          </Col>
          <Col :span="12">
            <FormItem :label="$t('hse.riskControl.form.sheet')">
              <Input v-model:value="riskForm.sheet" :placeholder="$t('hse.riskControl.form.sheetPlaceholder')" />
            </FormItem>
          </Col>
        </Row>
      </Form>
    </Modal>

    <Drawer
      v-model:open="detailDrawerVisible"
      :title="$t('hse.riskControl.detail.title')"
      width="760px"
    >
      <template v-if="currentRisk">
        <div class="detail-section">
          <h3 class="detail-title">{{ currentRisk.name }}</h3>
          <div class="detail-tags">
            <Tag :color="getLevelColor(currentRisk.level)">
              {{ currentRisk.level }}{{ $t('hse.riskControl.riskSuffix') }}
            </Tag>
            <Tag :color="getStatusColor(currentRisk.status)">
              {{ getStatusText(currentRisk.status) }}
            </Tag>
            <Badge
              :status="getExpiryBadgeStatus(currentRisk.expiryStatus)"
              :text="getExpiryText(currentRisk.expiryStatus)"
            />
          </div>
          <div class="detail-actions">
            <Popconfirm
              :title="$t('hse.riskControl.linkage.generateConfirm')"
              :ok-text="$t('hse.riskControl.action.confirmDelete')"
              :cancel-text="$t('hse.riskControl.action.cancel')"
              @confirm="handleGenerateHazard(currentRisk)"
            >
              <Button type="primary" :loading="generateHazardLoading" size="small">
                <template #icon><IconifyIcon icon="lucide:zap" /></template>
                {{ $t('hse.riskControl.linkage.generateHazard') }}
              </Button>
            </Popconfirm>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.type') }}</span>
            <span class="detail-value">{{ currentRisk.type || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.location') }}</span>
            <span class="detail-value">{{ currentRisk.location || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.area') }}</span>
            <span class="detail-value">{{ currentRisk.area || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.sheet') }}</span>
            <span class="detail-value">{{ currentRisk.sheet || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.gps') }}</span>
            <span class="detail-value">{{ currentRisk.lat && currentRisk.lng ? `${currentRisk.lng}, ${currentRisk.lat}` : $t('hse.riskControl.detail.gpsEmpty') }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.accidentType') }}</span>
            <span class="detail-value">{{ currentRisk.accidentType || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.assessmentDate') }}</span>
            <span class="detail-value">{{ formatDate(currentRisk.assessmentDate) }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.reviewCycle') }}</span>
            <span class="detail-value">{{ currentRisk.reviewCycle ? `${currentRisk.reviewCycle}${$t('hse.riskControl.detail.monthUnit')}` : $t('hse.riskControl.expiry.permanent') }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.linkage.lastHazardCheck') }}</span>
            <span class="detail-value">{{ formatDate(currentRisk.lastHazardCheckDate) || '-' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.linkage.hazardCount') }}</span>
            <span class="detail-value">
              <Badge :count="currentRisk.hazardCount || 0" :overflow-count="99" :number-style="{ backgroundColor: '#faad14' }" />
            </span>
          </div>
          <div class="detail-row">
            <span class="detail-label">{{ $t('hse.riskControl.detail.createdAt') }}</span>
            <span class="detail-value">{{ formatDateTime(currentRisk.createdAt) }}</span>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-label">{{ $t('hse.riskControl.detail.measures') }}</div>
          <div class="detail-content">{{ currentRisk.measures || $t('hse.riskControl.detail.empty') }}</div>
        </div>
        <div class="detail-section">
          <div class="detail-label">{{ $t('hse.riskControl.detail.emergency') }}</div>
          <div class="detail-content">{{ currentRisk.emergency || $t('hse.riskControl.detail.empty') }}</div>
        </div>

        <!-- 附件列表与历史版本 Tabs -->
        <Tabs v-model:activeKey="detailTab" class="detail-tabs">
          <TabPane :tab="$t('hse.riskControl.version.tabAttachments')" key="attachments">
            <div class="attachment-section">
              <div class="attachment-toolbar">
                <Input
                  v-model:value="uploadVersion"
                  :placeholder="$t('hse.riskControl.attachment.versionPlaceholder')"
                  style="width: 160px"
                  allow-clear
                />
                <Upload
                  :show-upload-list="false"
                  :before-upload="(file) => handleUploadAttachment(file)"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                >
                  <Button type="primary" :loading="attachmentUploading">
                    <template #icon><IconifyIcon icon="lucide:upload" /></template>
                    {{ $t('hse.riskControl.attachment.upload') }}
                  </Button>
                </Upload>
              </div>
              <Table
                :columns="attachmentColumns"
                :data-source="attachmentList"
                :loading="attachmentLoading"
                size="small"
                :pagination="false"
                :row-key="(record) => record.id"
                :locale="{ emptyText: $t('hse.riskControl.attachment.empty') }"
              >
                <template #bodyCell="{ column, record }">
                  <template v-if="column.key === 'originalName'">
                    <a :href="record.fileUrl" target="_blank" rel="noopener">{{ record.originalName }}</a>
                    <Tag v-if="record.isLatest" color="green" style="margin-left: 8px">
                      {{ $t('hse.riskControl.attachment.isLatest') }}
                    </Tag>
                  </template>
                  <template v-else-if="column.key === 'fileSize'">
                    {{ formatFileSize(record.fileSize) }}
                  </template>
                  <template v-else-if="column.key === 'createdAt'">
                    {{ formatDateTime(record.createdAt) }}
                  </template>
                  <template v-else-if="column.key === 'action'">
                    <a :href="record.fileUrl" target="_blank" rel="noopener">
                      {{ $t('hse.riskControl.attachment.download') }}
                    </a>
                    <Popconfirm
                      :title="$t('hse.riskControl.attachment.deleteConfirm')"
                      :ok-text="$t('hse.riskControl.action.confirmDelete')"
                      :cancel-text="$t('hse.riskControl.action.cancel')"
                      @confirm="handleDeleteAttachment(record as any)"
                    >
                      <Button type="link" size="small" danger>
                        {{ $t('hse.riskControl.attachment.delete') }}
                      </Button>
                    </Popconfirm>
                  </template>
                </template>
              </Table>
            </div>
          </TabPane>
          <TabPane :tab="$t('hse.riskControl.version.tabVersions')" key="versions">
            <Table
              :columns="versionColumns"
              :data-source="versionList"
              :loading="versionLoading"
              size="small"
              :pagination="false"
              :row-key="(record) => record.id"
              :locale="{ emptyText: $t('hse.riskControl.version.empty') }"
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
          </TabPane>
          <TabPane :tab="$t('hse.riskControl.linkage.tabRelatedHazards')" key="relatedHazards">
            <Table
              :columns="relatedHazardColumns"
              :data-source="relatedHazardList"
              :loading="relatedHazardLoading"
              size="small"
              :pagination="false"
              :row-key="(record) => record.id"
              :locale="{ emptyText: $t('hse.riskControl.linkage.noRelatedHazards') }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'isResolved'">
                  <Tag :color="record.isResolved === '是' ? 'green' : 'orange'">
                    {{ record.isResolved === '是' ? $t('hse.hazards.status.resolved') : $t('hse.hazards.status.unresolved') }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'checkDate'">
                  {{ formatDate(record.checkDate) }}
                </template>
                <template v-else-if="column.key === 'fixDate'">
                  {{ formatDate(record.fixDate) }}
                </template>
                <template v-else-if="column.key === 'linkType'">
                  <Tag :color="record.linkType === 'auto' ? 'blue' : record.linkType === 'expiring' ? 'orange' : 'default'">
                    {{ getLinkTypeText(record.linkType) }}
                  </Tag>
                </template>
              </template>
              </Table>
          </TabPane>
          <TabPane :tab="$t('hse.riskControl.assess.tab')" key="assessment">
            <div class="assess-section">
              <!-- 当前评估记录 -->
              <div class="assess-current" v-if="currentRisk && currentRisk.assessmentMethod">
                <div class="assess-current-title">{{ $t('hse.riskControl.assess.currentTitle') }}</div>
                <div class="assess-current-row">
                  <span class="assess-current-label">{{ $t('hse.riskControl.assess.currentMethod') }}</span>
                  <span class="assess-current-value">{{ currentRisk.assessmentMethod }}</span>
                </div>
                <div class="assess-current-row">
                  <span class="assess-current-label">{{ $t('hse.riskControl.assess.currentScore') }}</span>
                  <span class="assess-current-value">{{ currentRisk.assessmentScore ?? '-' }}</span>
                </div>
                <div class="assess-current-row">
                  <span class="assess-current-label">{{ $t('hse.riskControl.assess.currentLevel') }}</span>
                  <Tag :color="getLevelColor(currentRisk.level)">{{ currentRisk.level }}{{ $t('hse.riskControl.riskSuffix') }}</Tag>
                </div>
                <div class="assess-current-row">
                  <span class="assess-current-label">{{ $t('hse.riskControl.assess.currentDate') }}</span>
                  <span class="assess-current-value">{{ formatDate(currentRisk.assessmentDate) }}</span>
                </div>
                <div class="assess-current-row">
                  <span class="assess-current-label">{{ $t('hse.riskControl.assess.currentCycle') }}</span>
                  <span class="assess-current-value">{{ currentRisk.reviewCycle ? `${currentRisk.reviewCycle}${$t('hse.riskControl.detail.monthUnit')}` : $t('hse.riskControl.expiry.permanent') }}</span>
                </div>
              </div>
              <Alert
                v-else-if="!assessmentScales"
                type="warning"
                :message="$t('hse.riskControl.assess.scaleLoadFailed')"
                show-icon
                class="assess-alert"
              />
              <div v-else class="assess-empty">{{ $t('hse.riskControl.assess.currentEmpty') }}</div>

              <Divider />

              <!-- 评估录入表单 -->
              <Form layout="vertical" class="assess-form">
                <FormItem :label="$t('hse.riskControl.assess.method')">
                  <RadioGroup v-model:value="assessMethod">
                    <RadioButton value="LEC">{{ $t('hse.riskControl.assess.methodLEC') }}</RadioButton>
                    <RadioButton value="LS">{{ $t('hse.riskControl.assess.methodLS') }}</RadioButton>
                  </RadioGroup>
                </FormItem>

                <FormItem :label="`${$t('hse.riskControl.assess.formula')}：${currentScale?.formula || ''}`">
                  <div class="assess-factors">
                    <div class="assess-factor" v-for="f in (currentScale?.factors || [])" :key="f.code">
                      <div class="assess-factor-label">
                        <strong>{{ f.symbol }}</strong> · {{ f.label }}
                      </div>
                      <Select
                        v-model:value="(assessForm as any)[f.code]"
                        :placeholder="f.symbol"
                        style="width: 100%"
                        allow-clear
                      >
                        <SelectOption v-for="opt in f.options" :key="opt.value" :value="opt.value">
                          {{ opt.value }} — {{ opt.label }}
                        </SelectOption>
                      </Select>
                    </div>
                  </div>
                </FormItem>

                <FormItem :label="$t('hse.riskControl.assess.score')">
                  <div class="assess-score">
                    <span class="assess-score-value" :style="{ color: liveLevelColor }">
                      {{ liveScore !== null ? liveScore : '-' }}
                    </span>
                    <Tag v-if="liveLevel" :color="liveLevel.color">
                      {{ liveLevel.level }} · {{ liveLevel.alias }}
                    </Tag>
                    <span class="assess-score-hint">
                      {{ $t('hse.riskControl.assess.scoreHint', { formula: currentScale?.formula || '' }) }}
                    </span>
                  </div>
                </FormItem>

                <FormItem :label="$t('hse.riskControl.assess.reviewCycle')">
                  <Select
                    v-model:value="assessForm.reviewCycle"
                    style="width: 100%"
                    :placeholder="$t('hse.riskControl.assess.reviewCycle')"
                  >
                    <SelectOption v-for="o in (assessmentScales?.reviewCycleOptions || [])" :key="o.value" :value="o.value">
                      {{ o.label }}
                    </SelectOption>
                  </Select>
                  <div class="assess-hint">{{ $t('hse.riskControl.assess.reviewCycleHint') }}</div>
                </FormItem>

                <FormItem :label="$t('hse.riskControl.assess.assessmentDate')">
                  <DatePicker
                    v-model:value="assessForm.assessmentDate"
                    style="width: 100%"
                    value-format="YYYY-MM-DD"
                    :placeholder="$t('hse.riskControl.assess.assessmentDate')"
                  />
                </FormItem>

                <FormItem :label="$t('hse.riskControl.assess.remark')">
                  <Textarea v-model:value="assessForm.remark" :rows="2" :placeholder="$t('hse.riskControl.assess.remark')" />
                </FormItem>

                <FormItem>
                  <Button type="primary" :loading="assessSaving" @click="handleSaveAssess">
                    <template #icon><IconifyIcon icon="lucide:save" /></template>
                    {{ $t('hse.riskControl.assess.save') }}
                  </Button>
                </FormItem>
              </Form>
            </div>
          </TabPane>
        </Tabs>
      </template>
    </Drawer>

    <RiskMapDrawer
      v-model:open="mapDrawerVisible"
      :risks="riskList"
      :highlighted-id="highlightedRiskId"
      @marker-click="handleMarkerClick"
    />
  </Page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  Card,
  Row,
  Col,
  Table,
  Form,
  FormItem,
  Input,
  InputNumber,
  Select,
  SelectOption,
  Button,
  Modal,
  Drawer,
  Tag,
  Badge,
  DatePicker,
  Textarea,
  Tabs,
  TabPane,
  Upload,
  Alert,
  Divider,
  RadioGroup,
  RadioButton,
  message,
  Popconfirm,
  Skeleton,
  Space,
} from 'ant-design-vue';
import type { FormInstance } from 'ant-design-vue';
import { IconifyIcon } from '@vben/icons';
import { Page } from '@vben/common-ui';
import { HelpButton } from '#/components/hse';
import HseStatCard from '#/components/hse/StatCard.vue';
import ImportButtonGroup from '#/components/hse/ImportButtonGroup.vue';
import RiskMapDrawer from '#/components/hse/RiskMapDrawer.vue';
import dayjs from 'dayjs';
import { $t } from '#/locales';

import {
  getRiskList,
  getRiskStats,
  getRiskDetail,
  createRisk,
  updateRisk,
  deleteRisk,
  getRiskAttachments,
  uploadRiskAttachment,
  deleteRiskAttachment,
  getRiskVersions,
  exportRisks,
  generateHazardFromRisk,
  getRelatedHazards,
  getAssessmentScales,
  assessRisk,
  type RiskControlApi,
} from '#/api/hse/risk-control';

const loading = ref(false);
const riskList = ref<RiskControlApi.RiskSource[]>([]);
const total = ref(0);

const searchForm = reactive({
  keyword: '',
  level: undefined as string | undefined,
  type: undefined as string | undefined,
  area: undefined as string | undefined,
  expiryStatus: undefined as RiskControlApi.ExpiryStatus | undefined,
});

const pagination = reactive({
  page: 1,
  pageSize: 10,
});

const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRisk = ref<RiskControlApi.RiskSource | null>(null);
const riskForm = reactive({
  name: '',
  level: '四级' as RiskControlApi.RiskSource['level'],
  type: '',
  status: '正常' as RiskControlApi.RiskSource['status'],
  location: '',
  lat: null as any,
  lng: null as any,
  area: '',
  measures: '',
  emergency: '',
  accidentType: '',
  sheet: '',
  assessmentDate: undefined as string | undefined,
  reviewCycle: 12 as number | undefined,
});

const formRef = ref<FormInstance>();

const formRules = {
  name: [
    { required: true, message: $t('hse.riskControl.validate.nameRequired'), trigger: 'blur' },
    { min: 2, max: 100, message: $t('hse.riskControl.validate.nameLength'), trigger: 'blur' },
  ],
  level: [{ required: true, message: $t('hse.riskControl.validate.levelRequired'), trigger: 'change' }],
  measures: [
    { required: true, message: $t('hse.riskControl.validate.measuresRequired'), trigger: 'blur' },
  ],
  area: [{ required: true, message: $t('hse.riskControl.validate.areaRequired'), trigger: 'change' }],
};

const detailDrawerVisible = ref(false);
const currentRisk = ref<RiskControlApi.RiskSource | null>(null);
const mapDrawerVisible = ref(false);
const highlightedRiskId = ref<number | null>(null);
let highlightTimer: ReturnType<typeof setTimeout> | null = null;
// 提示词-215：风险清单 ↔ 风险地图 双向联动
const router = useRouter();
const route = useRoute();

// 详情 Drawer Tab 切换
const detailTab = ref<'attachments' | 'versions' | 'relatedHazards' | 'assessment'>('attachments');

// ========== 风险评估工作台（提示词-206 §3） ==========
const assessmentScales = ref<RiskControlApi.AssessmentScalesResult | null>(null);
const assessLoading = ref(false);
const assessSaving = ref(false);
const assessMethod = ref<RiskControlApi.AssessMethod>('LEC');
const assessForm = reactive({
  l: undefined as number | undefined,
  e: undefined as number | undefined,
  c: undefined as number | undefined,
  s: undefined as number | undefined,
  reviewCycle: 12 as number | undefined,
  assessmentDate: undefined as string | undefined,
  remark: '',
});

// 等级色 → 十六进制（用于风险值文字着色）
const LEVEL_COLOR_HEX: Record<string, string> = {
  red: '#ff4d4f',
  orange: '#fa8c16',
  gold: '#faad14',
  green: '#52c41a',
};

// 当前选中方法的量表（因子选项 + 等级阈值）
const currentScale = computed<RiskControlApi.AssessScale | null>(() => {
  if (!assessmentScales.value) return null;
  return assessmentScales.value.scales[assessMethod.value] || null;
});

// 实时风险值（D / R）：按后端量表规则在前端镜像计算，仅作参考展示；
// 最终 score / level 一律以后端权威计算为准（不信任前端传入）
const liveScore = computed<number | null>(() => {
  const scale = currentScale.value;
  if (!scale) return null;
  const values = scale.factors.map((f) => {
    const raw = (assessForm as any)[f.code];
    return raw === undefined || raw === null || raw === '' ? null : Number(raw);
  });
  if (values.some((v) => v === null || !Number.isFinite(v))) return null;
  let score = 1;
  for (const v of values) score *= v as number;
  return Math.round(score * 100) / 100;
});

// 实时等级判定（与后端 judgeAssessmentLevel 同口径，阈值来自量表，不硬编码）
const liveLevel = computed<RiskControlApi.AssessThreshold | null>(() => {
  const scale = currentScale.value;
  const score = liveScore.value;
  if (!scale || score === null) return null;
  return (
    scale.thresholds.find((t) => score >= t.min) ||
    scale.thresholds[scale.thresholds.length - 1] ||
    null
  );
});

const liveLevelColor = computed(() =>
  liveLevel.value ? LEVEL_COLOR_HEX[liveLevel.value.color] : undefined,
);

async function fetchAssessmentScales() {
  assessLoading.value = true;
  try {
    const res = await getAssessmentScales();
    assessmentScales.value = res;
  } catch (err) {
    console.warn('获取评估量表失败:', err);
    message.error($t('hse.riskControl.assess.scaleLoadFailed'));
    assessmentScales.value = null;
  } finally {
    assessLoading.value = false;
  }
}

// 打开详情时，依据当前记录初始化评估表单（因子值未落库，需用户重新录入）
function resetAssessForm(record: RiskControlApi.RiskSource) {
  const method = (record.assessmentMethod as RiskControlApi.AssessMethod) || 'LEC';
  assessMethod.value = method;
  assessForm.l = undefined;
  assessForm.e = undefined;
  assessForm.c = undefined;
  assessForm.s = undefined;
  assessForm.reviewCycle = record.reviewCycle ?? 12;
  assessForm.assessmentDate = record.assessmentDate || dayjs().format('YYYY-MM-DD');
  assessForm.remark = '';
}

async function handleSaveAssess() {
  if (!currentRisk.value) return;
  const method = assessMethod.value;
  const scale = assessmentScales.value?.scales?.[method];
  if (!scale) {
    message.error($t('hse.riskControl.assess.scaleMissing'));
    return;
  }
  for (const f of scale.factors) {
    const v = (assessForm as any)[f.code];
    if (v === undefined || v === null || v === '') {
      message.warning($t('hse.riskControl.assess.factorRequired', { symbol: f.symbol, label: f.label }));
      return;
    }
  }
  assessSaving.value = true;
  try {
    const params: RiskControlApi.AssessParams = {
      method,
      l: assessForm.l as number,
      reviewCycle: assessForm.reviewCycle,
      assessmentDate: assessForm.assessmentDate || dayjs().format('YYYY-MM-DD'),
      remark: assessForm.remark || undefined,
      changedBy: 'admin',
    };
    if (method === 'LEC') {
      params.e = assessForm.e as number;
      params.c = assessForm.c as number;
    } else {
      params.s = assessForm.s as number;
    }
    const res = await assessRisk(currentRisk.value.id, params);
    message.success($t('hse.riskControl.assess.saveSuccess'));
    // 用后端权威返回刷新详情（method/score/level/date/cycle 已写入）
    currentRisk.value = {
      ...currentRisk.value,
      assessmentMethod: res.assessmentMethod ?? res.assessment?.method ?? method,
      assessmentScore: res.assessmentScore ?? res.assessment?.score ?? null,
      level: res.level ?? res.assessment?.level ?? currentRisk.value.level,
      assessmentDate: res.assessmentDate ?? assessForm.assessmentDate ?? null,
      reviewCycle: res.reviewCycle ?? assessForm.reviewCycle ?? null,
    } as RiskControlApi.RiskSource;
    // 同步列表行的等级 / 分数
    fetchData();
  } catch (err) {
    console.warn('风险评估保存失败:', err);
    message.error($t('hse.riskControl.assess.saveFailed'));
  } finally {
    assessSaving.value = false;
  }
}

// ========== 风险 → 隐患 联动状态（Phase 14） ==========
const generateHazardLoading = ref(false);
const relatedHazardList = ref<RiskControlApi.RelatedHazard[]>([]);
const relatedHazardLoading = ref(false);
const relatedHazardColumns = [
  { title: $t('hse.riskControl.linkage.hazardDescription'), dataIndex: 'description', key: 'description', ellipsis: true },
  { title: $t('hse.riskControl.linkage.hazardChecker'), dataIndex: 'checker', key: 'checker', width: 100 },
  { title: $t('hse.riskControl.linkage.hazardCheckDate'), key: 'checkDate', width: 110 },
  { title: $t('hse.riskControl.linkage.hazardFixDate'), key: 'fixDate', width: 110 },
  { title: $t('hse.riskControl.linkage.hazardStatus'), key: 'isResolved', width: 90 },
  { title: $t('hse.riskControl.linkage.linkType'), key: 'linkType', width: 100 },
];

function getLinkTypeText(type?: string) {
  if (!type) return '-';
  if (type === 'auto') return $t('hse.riskControl.linkage.linkTypeAuto');
  if (type === 'expiring') return $t('hse.riskControl.linkage.linkTypeExpiring');
  return $t('hse.riskControl.linkage.linkTypeManual');
}

// 附件列表状态
const attachmentList = ref<RiskControlApi.Attachment[]>([]);
const attachmentLoading = ref(false);
const attachmentUploading = ref(false);
const uploadVersion = ref('');
const attachmentColumns = [
  { title: $t('hse.riskControl.attachment.fileName'), key: 'originalName', width: 280 },
  { title: $t('hse.riskControl.attachment.version'), dataIndex: 'version', key: 'version', width: 90 },
  { title: $t('hse.riskControl.attachment.uploadedBy'), dataIndex: 'uploadedBy', key: 'uploadedBy', width: 100 },
  { title: $t('hse.riskControl.attachment.fileSize'), key: 'fileSize', width: 100 },
  { title: $t('hse.riskControl.attachment.uploadedAt'), key: 'createdAt', width: 160 },
  { title: $t('hse.riskControl.action.title'), key: 'action', width: 130 },
];

// 历史版本状态
const versionList = ref<RiskControlApi.VersionRecord[]>([]);
const versionLoading = ref(false);
const versionColumns = [
  { title: $t('hse.riskControl.version.version'), dataIndex: 'version', key: 'version', width: 100 },
  { title: $t('hse.riskControl.version.changeType'), key: 'changeType', width: 110 },
  { title: $t('hse.riskControl.version.changeSummary'), dataIndex: 'changeSummary', key: 'changeSummary' },
  { title: $t('hse.riskControl.version.changedBy'), dataIndex: 'changedBy', key: 'changedBy', width: 110 },
  { title: $t('hse.riskControl.version.changedAt'), key: 'createdAt', width: 160 },
];

// 报表导出
const exportLoading = ref(false);

const statsData = ref({
  total: 0,
  level1: 0,
  level2: 0,
  level3: 0,
  level4: 0,
});
const statsLoading = ref(false);

const statItems = computed(() => [
  { key: 'total', label: $t('hse.riskControl.stats.total'), value: statsData.value.total, color: 'blue', icon: 'lucide:shield' },
  { key: 'level1', label: $t('hse.riskControl.stats.level1'), value: statsData.value.level1, color: 'red', icon: 'lucide:alert-circle' },
  { key: 'level2', label: $t('hse.riskControl.stats.level2'), value: statsData.value.level2, color: 'orange', icon: 'lucide:alert-triangle' },
  { key: 'level3', label: $t('hse.riskControl.stats.level3'), value: statsData.value.level3, color: 'cyan', icon: 'lucide:alert-octagon' },
  { key: 'level4', label: $t('hse.riskControl.stats.level4'), value: statsData.value.level4, color: 'green', icon: 'lucide:shield-check' },
]);

const columns = [
  {
    title: $t('hse.riskControl.column.index'),
    key: 'index',
    width: 60,
    align: 'center' as const,
    customRender: ({ index }: { index: number }) =>
      (pagination.page - 1) * pagination.pageSize + index + 1,
  },
  { title: $t('hse.riskControl.column.name'), dataIndex: 'name', key: 'name', width: 180 },
  { title: $t('hse.riskControl.column.level'), key: 'level', width: 120 },
  { title: $t('hse.riskControl.column.type'), dataIndex: 'type', key: 'type', width: 120 },
  { title: $t('hse.riskControl.column.location'), dataIndex: 'location', key: 'location', width: 160 },
  { title: $t('hse.riskControl.column.area'), dataIndex: 'area', key: 'area', width: 100 },
  { title: $t('hse.riskControl.column.status'), key: 'status', width: 100 },
  { title: $t('hse.riskControl.expiry.title'), key: 'expiryStatus', width: 110, align: 'center' as const },
  { title: $t('hse.riskControl.column.assessmentDate'), key: 'assessmentDate', width: 120 },
  { title: $t('hse.riskControl.column.createdAt'), key: 'createdAt', width: 140 },
  { title: $t('hse.riskControl.action.title'), key: 'action', width: 180, fixed: 'right' as const },
];

function formatDate(date?: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD');
}

function formatDateTime(date?: string | null): string {
  if (!date) return '-';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
}

function getLevelColor(level: string): string {
  const map: Record<string, string> = {
    '一级': 'red',
    '二级': 'orange',
    '三级': 'gold',
    '四级': 'green',
  };
  return map[level] || 'default';
}

function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    '正常': 'green',
    '已处置': 'blue',
    '监控中': 'orange',
  };
  return map[status] || 'default';
}

function getStatusText(status: string): string {
  const map: Record<string, string> = {
    '正常': $t('hse.riskControl.status.normal'),
    '已处置': $t('hse.riskControl.status.resolved'),
    '监控中': $t('hse.riskControl.status.monitoring'),
  };
  return map[status] || status;
}

// 时效状态 → Antd Badge 状态映射
function getExpiryBadgeStatus(status?: string): 'success' | 'warning' | 'error' | 'default' | 'processing' {
  const map: Record<string, 'success' | 'warning' | 'error' | 'default' | 'processing'> = {
    normal: 'success',       // 绿色 正常
    expiring: 'warning',     // 黄色 临期
    expired: 'error',        // 红色 过期
    permanent: 'default',    // 灰色 长期有效
    unknown: 'default',
  };
  return map[status || 'unknown'] || 'default';
}

function getExpiryText(status?: string): string {
  const map: Record<string, string> = {
    normal: $t('hse.riskControl.expiry.normal'),
    expiring: $t('hse.riskControl.expiry.expiring'),
    expired: $t('hse.riskControl.expiry.expired'),
    permanent: $t('hse.riskControl.expiry.permanent'),
    unknown: $t('hse.riskControl.expiry.unknown'),
  };
  return map[status || 'unknown'] || $t('hse.riskControl.expiry.unknown');
}

// 变更类型颜色
function getChangeTypeColor(type: string): string {
  const map: Record<string, string> = {
    create: 'green',
    update: 'blue',
    import: 'cyan',
    revise: 'orange',
  };
  return map[type] || 'default';
}

// 变更类型文本
function getChangeTypeText(type: string): string {
  const fallbackMap: Record<string, string> = {
    create: $t('hse.riskControl.version.changeTypeCreate'),
    update: $t('hse.riskControl.version.changeTypeUpdate'),
    import: $t('hse.riskControl.version.changeTypeImport'),
    revise: $t('hse.riskControl.version.changeTypeRevise'),
  };
  return fallbackMap[type] || type;
}

// 文件大小格式化
function formatFileSize(bytes: number): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function transformResponseData(data: any): RiskControlApi.RiskSource[] {
  if (!Array.isArray(data)) return [];
  // 后端已统一 camelCase 输出，仅做防御性默认值填充
  return data.map((item: any) => ({
    ...item,
    name: item.name || '',
    type: item.type || '',
    category: item.category || '',
    location: item.location || '',
    accidentType: item.accidentType || '',
    level: (item.level || '四级') as RiskControlApi.RiskSource['level'],
    measures: item.measures || '',
    emergency: item.emergency || '',
    area: item.area || '',
    sheet: item.sheet || '',
    polygon: item.polygon || [],
    status: (item.status || '正常') as RiskControlApi.RiskSource['status'],
    assessmentDate: item.assessmentDate ?? null,
    reviewCycle: item.reviewCycle ?? null,
    expiryStatus: item.expiryStatus || 'unknown',
  }));
}

function transformRequestData(data: Partial<RiskControlApi.RiskSource>): Record<string, any> {
  // 后端 pickField 已支持 camelCase 输入，直接透传
  return { ...data };
}

async function fetchData() {
  loading.value = true;
  try {
    const params: RiskControlApi.RiskListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchForm.keyword || undefined,
      level: searchForm.level,
      type: searchForm.type,
      area: searchForm.area,
      expiryStatus: searchForm.expiryStatus,
    };
    const res = await getRiskList(params);
    riskList.value = transformResponseData(res.list || []);
    total.value = res.total || 0;
  } catch (err) {
    console.warn('获取风险列表失败:', err);
    message.error($t('hse.message.fetchListFailed', { module: $t('hse.riskControl.title') }));
    riskList.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
}

async function fetchStats() {
  statsLoading.value = true;
  try {
    const res = await getRiskStats();
    statsData.value = {
      total: res.total || 0,
      level1: res.byLevel?.['一级'] || 0,
      level2: res.byLevel?.['二级'] || 0,
      level3: res.byLevel?.['三级'] || 0,
      level4: res.byLevel?.['四级'] || 0,
    };
  } catch (err) {
    console.warn('获取风险统计失败:', err);
    message.error($t('hse.message.fetchStatsFailed'));
  } finally {
    statsLoading.value = false;
  }
}

function handleSearch() {
  pagination.page = 1;
  fetchData();
}

function handleReset() {
  searchForm.keyword = '';
  searchForm.level = undefined;
  searchForm.type = undefined;
  searchForm.area = undefined;
  searchForm.expiryStatus = undefined;
  pagination.page = 1;
  fetchData();
}

function handleStatCardClick(key: string) {
  searchForm.keyword = '';
  searchForm.type = undefined;
  searchForm.area = undefined;
  searchForm.expiryStatus = undefined;

  switch (key) {
    case 'level1':
      searchForm.level = '一级';
      break;
    case 'level2':
      searchForm.level = '二级';
      break;
    case 'level3':
      searchForm.level = '三级';
      break;
    case 'level4':
      searchForm.level = '四级';
      break;
    default:
      searchForm.level = undefined;
  }

  pagination.page = 1;
  fetchData();
}

function handleTableChange(pag: { current: number; pageSize: number }) {
  pagination.page = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
}

function handleRefresh() {
  fetchData();
  fetchStats();
}

function handleCreate() {
  editingRisk.value = null;
  Object.assign(riskForm, {
    name: '',
    level: '四级',
    type: '',
    status: '正常',
    location: '',
    lat: null,
    lng: null,
    area: '',
    measures: '',
    emergency: '',
    accidentType: '',
    sheet: '',
    assessmentDate: dayjs().format('YYYY-MM-DD'),
    reviewCycle: 12,
  });
  modalVisible.value = true;
}

function handleEdit(record: RiskControlApi.RiskSource) {
  editingRisk.value = record;
  Object.assign(riskForm, {
    name: record.name,
    level: record.level,
    type: record.type,
    status: record.status,
    location: record.location,
    lat: record.lat ?? null,
    lng: record.lng ?? null,
    area: record.area,
    measures: record.measures,
    emergency: record.emergency,
    accidentType: record.accidentType,
    sheet: record.sheet,
    assessmentDate: record.assessmentDate || undefined,
    reviewCycle: record.reviewCycle ?? 12,
  });
  modalVisible.value = true;
}

function handleView(record: RiskControlApi.RiskSource) {
  currentRisk.value = record;
  detailDrawerVisible.value = true;
  detailTab.value = 'attachments';
  attachmentList.value = [];
  versionList.value = [];
  relatedHazardList.value = [];
  uploadVersion.value = '';
  fetchAttachments(record.id);
  fetchVersions(record.id);
  fetchRelatedHazards(record.id);
  // 提示词-206 §3：预加载评估量表（仅首次），并初始化评估表单
  if (!assessmentScales.value) {
    fetchAssessmentScales();
  }
  resetAssessForm(record);
}

// 获取附件列表
async function fetchAttachments(id: number) {
  attachmentLoading.value = true;
  try {
    const res = await getRiskAttachments(id);
    attachmentList.value = res || [];
  } catch (err) {
    console.warn('获取附件列表失败:', err);
    message.error($t('hse.riskControl.attachment.loadFailed'));
    attachmentList.value = [];
  } finally {
    attachmentLoading.value = false;
  }
}

// 上传附件（复用 risk-control 路由，Upload 组件 before-upload 返回 false 阻止默认行为）
async function handleUploadAttachment(file: File) {
  if (!currentRisk.value) return false;
  attachmentUploading.value = true;
  try {
    await uploadRiskAttachment(currentRisk.value.id, file, {
      version: uploadVersion.value || undefined,
      uploadedBy: 'admin',
    });
    message.success($t('hse.riskControl.attachment.uploadSuccess'));
    uploadVersion.value = '';
    await fetchAttachments(currentRisk.value.id);
  } catch (err) {
    console.warn('附件上传失败:', err);
    message.error($t('hse.riskControl.attachment.uploadFailed'));
  } finally {
    attachmentUploading.value = false;
  }
  return false; // 阻止 antd Upload 默认上传
}

// 删除附件（Popconfirm 确认）
async function handleDeleteAttachment(record: RiskControlApi.Attachment) {
  if (!currentRisk.value) return;
  try {
    await deleteRiskAttachment(currentRisk.value.id, record.id);
    message.success($t('hse.riskControl.attachment.deleteSuccess'));
    await fetchAttachments(currentRisk.value.id);
  } catch (err) {
    console.warn('附件删除失败:', err);
    message.error($t('hse.riskControl.attachment.deleteFailed'));
  }
}

// 获取历史版本
async function fetchVersions(id: number) {
  versionLoading.value = true;
  try {
    const res = await getRiskVersions(id);
    versionList.value = res || [];
  } catch (err) {
    console.warn('获取历史版本失败:', err);
    message.error($t('hse.riskControl.version.loadFailed'));
    versionList.value = [];
  } finally {
    versionLoading.value = false;
  }
}

// ========== Phase 14：风险 → 隐患 正向联动 ==========
// 获取风险点关联的隐患列表
async function fetchRelatedHazards(id: number) {
  relatedHazardLoading.value = true;
  try {
    const res = await getRelatedHazards(id);
    relatedHazardList.value = res?.list || [];
  } catch (err) {
    console.warn('获取关联隐患列表失败:', err);
    relatedHazardList.value = [];
  } finally {
    relatedHazardLoading.value = false;
  }
}

// 从风险点生成隐患记录（Popconfirm 确认后调用）
async function handleGenerateHazard(risk: RiskControlApi.RiskSource) {
  generateHazardLoading.value = true;
  try {
    await generateHazardFromRisk(risk.id, {
      linkType: 'manual',
      changedBy: 'admin',
    });
    message.success($t('hse.riskControl.linkage.generateSuccess'));
    // 刷新关联隐患列表 + 重新获取风险详情（更新 hazardCount）
    await fetchRelatedHazards(risk.id);
    try {
      const updated = await getRiskDetail(risk.id);
      if (updated) currentRisk.value = updated;
    } catch (_e) {
      // 静默失败
    }
  } catch (err) {
    console.warn('生成隐患失败:', err);
    message.error($t('hse.riskControl.linkage.generateFailed'));
  } finally {
    generateHazardLoading.value = false;
  }
}

// 报表导出（CSV Blob 下载，复用后端 /export 端点）
async function handleExport() {
  exportLoading.value = true;
  try {
    const blob = await exportRisks();
    if (!(blob instanceof Blob)) {
      message.error($t('hse.riskControl.export.failed'));
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `risk-control_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success($t('hse.riskControl.export.success'));
  } catch (err) {
    console.warn('导出失败:', err);
    message.error($t('hse.riskControl.export.failed'));
  } finally {
    exportLoading.value = false;
  }
}

function handleMarkerClick(risk: RiskControlApi.RiskSource) {
  highlightedRiskId.value = risk.id;
  if (highlightTimer) clearTimeout(highlightTimer);
  const idx = riskList.value.findIndex((r) => r.id === risk.id);
  if (idx >= 0) {
    const targetPage = Math.floor(idx / pagination.pageSize) + 1;
    if (targetPage !== pagination.page) {
      pagination.page = targetPage;
      fetchData();
    }
    nextTick(() => {
      const rowEl = document.querySelector('.risk-row-highlighted');
      if (rowEl) {
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }
  highlightTimer = setTimeout(() => {
    highlightedRiskId.value = null;
  }, 3000);
}

function handleCustomRow(record: RiskControlApi.RiskSource) {
  return {
    onClick: () => {
      if (mapDrawerVisible.value) {
        // 已有逻辑：Drawer 内联动高亮
        highlightedRiskId.value = record.id;
        if (highlightTimer) clearTimeout(highlightTimer);
        highlightTimer = setTimeout(() => {
          highlightedRiskId.value = null;
        }, 3000);
      } else {
        // 提示词-215/217：Drawer 未打开时，跳转到独立风险地图页面并定位（带高亮动画）
        router.push({ path: '/risk/map', query: { riskId: String(record.id), focus: 'animate' } });
      }
    },
    style: { cursor: 'pointer' }, // 始终显示为可点击
  };
}

// 提示词-217 任务一：操作列"定位"按钮 → 跳转风险地图并播放定位高亮动画
function handleLocateOnMap(record: RiskControlApi.RiskSource) {
  router.push({
    path: '/risk/map',
    query: { riskId: String(record.id), focus: 'animate' },
  });
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!riskForm.name) {
    message.warning($t('hse.riskControl.validate.nameRequired'));
    return;
  }
  modalLoading.value = true;
  try {
    const data = transformRequestData({
      name: riskForm.name,
      level: riskForm.level,
      type: riskForm.type,
      status: riskForm.status,
      location: riskForm.location,
      lat: riskForm.lat,
      lng: riskForm.lng,
      area: riskForm.area,
      measures: riskForm.measures,
      emergency: riskForm.emergency,
      accidentType: riskForm.accidentType,
      sheet: riskForm.sheet,
      assessmentDate: riskForm.assessmentDate || null,
      reviewCycle: riskForm.reviewCycle ?? null,
    });
    if (editingRisk.value) {
      await updateRisk(editingRisk.value.id, data);
      message.success($t('hse.riskControl.message.updateSuccess'));
    } else {
      await createRisk(data);
      message.success($t('hse.riskControl.message.createSuccess'));
    }
    modalVisible.value = false;
    fetchData();
    fetchStats();
  } catch (err) {
    console.warn('保存失败:', err);
    message.error($t('hse.message.saveFailed'));
  } finally {
    modalLoading.value = false;
  }
}

async function handleDelete(record: RiskControlApi.RiskSource) {
  try {
    await deleteRisk(record.id);
    message.success($t('hse.riskControl.message.deleteSuccess'));
    fetchData();
    fetchStats();
  } catch (err) {
    console.warn('删除失败:', err);
    message.error($t('hse.message.deleteFailed'));
  }
}

onMounted(async () => {
  fetchStats();
  await fetchData();
  // 提示词-215 任务二（反向）：从地图页 ?riskId=xxx 跳转而来，自动高亮并滚动到该行
  const riskId = route.query.riskId;
  if (riskId) {
    const targetId = Number(riskId);
    const target = riskList.value.find((r) => r.id === targetId);
    if (target) {
      highlightedRiskId.value = targetId;
      nextTick(() => {
        const rowEl = document.querySelector('.risk-row-highlighted');
        if (rowEl) rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      highlightTimer = setTimeout(() => {
        highlightedRiskId.value = null;
      }, 3000);
    }
    // 清除 query 参数，避免刷新后重复定位
    router.replace({ query: {} });
  }
});
</script>

<style scoped lang="scss">
.hse-page {
  // 提示词-218：5 张卡片在 lg/xl（≥992px）断点恰好等宽 5 列，不留第 6 列空位。
  // antd Col 栅格无 1/5 整数 span（24 栅格），故在 ≥992px 用 !important 覆写内联宽度为 20%。
  // 5 × 20% = 100%，gutter 仍负责卡片间留白，xs/sm/md 断点保持原响应式列数。
  @media (min-width: 992px) {
    .stat-col.ant-col {
      flex: 0 0 20% !important;
      max-width: 20% !important;
    }
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;

    .action-group {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
  }

  .filter-form {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid hsl(var(--border));
  }

  .detail-section {
    margin-bottom: 24px;

    .detail-title {
      margin: 0 0 8px 0;
      font-size: 18px;
      font-weight: 600;
    }

    .detail-tags {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }

    .detail-actions {
      margin-top: 12px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .detail-row {
      display: flex;
      padding: 8px 0;
      border-bottom: 1px solid hsl(var(--border));

      .detail-label {
        width: 110px;
        color: hsl(var(--foreground) / 0.45);
        flex-shrink: 0;
      }

      .detail-value {
        flex: 1;
        color: hsl(var(--foreground));
      }
    }

    .detail-label {
      color: hsl(var(--foreground) / 0.45);
      margin-bottom: 8px;
    }

    .detail-content {
      padding: 12px;
      background: hsl(var(--muted));
      border-radius: 6px;
      color: hsl(var(--foreground));
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-all;
    }
  }

  .detail-tabs {
    margin-top: 16px;
  }

  .assess-section {
    .assess-current {
      padding: 12px;
      background: hsl(var(--muted));
      border-radius: 6px;
      margin-bottom: 8px;

      .assess-current-title {
        font-weight: 600;
        margin-bottom: 8px;
      }

      .assess-current-row {
        display: flex;
        padding: 4px 0;

        .assess-current-label {
          width: 90px;
          color: hsl(var(--foreground) / 0.45);
          flex-shrink: 0;
        }

        .assess-current-value {
          flex: 1;
          color: hsl(var(--foreground));
        }
      }
    }

    .assess-alert {
      margin-bottom: 8px;
    }

    .assess-empty {
      padding: 12px;
      color: hsl(var(--foreground) / 0.45);
      background: hsl(var(--muted));
      border-radius: 6px;
      margin-bottom: 8px;
    }

    .assess-factors {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }

    .assess-factor-label {
      margin-bottom: 6px;
      font-size: 13px;
      color: hsl(var(--foreground) / 0.65);
    }

    .assess-score {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;

      .assess-score-value {
        font-size: 28px;
        font-weight: 700;
        line-height: 1;
        transition: color 0.3s ease;
      }

      .assess-score-hint {
        color: hsl(var(--foreground) / 0.45);
        font-size: 12px;
      }
    }

    .assess-hint {
      margin-top: 6px;
      color: hsl(var(--foreground) / 0.45);
      font-size: 12px;
    }
  }

  .attachment-section {
    .attachment-toolbar {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
  }
}
</style>

<style lang="scss">
/* 非 scoped 块：行高亮由 Table 的 row-class-name 动态注入，需全局类命中。
   仅限 .risk-row-highlighted 业务类名，避免污染全局 antd 样式。
   使用高特异性选择器替代 !important，覆盖 antd 默认行背景。 */
.ant-table-tbody > tr.risk-row-highlighted > td {
  background-color: hsl(var(--primary) / 0.1);
  transition: background-color 0.3s ease;
}

.ant-table-tbody > tr.risk-row-highlighted:hover > td {
  background-color: hsl(var(--primary) / 0.15);
}
</style>

<!-- 设计系统对齐：非 scoped 块（.ant-table-tbody>tr.risk-row-highlighted>td）已用 hsl(var(--primary)/0.1) 语义变量且仅限高亮行业务类，无全局泄漏、主题可跟随，保留 -->

