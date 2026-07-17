export interface DashboardSummaryDto {
  activePatrols: number;
  delayedPatrols: number;
  issues: number;
  completedToday: number;
  shiftCoveragePercent: number;
  completedPoints: number;
  totalPoints: number;
  onlineEmployees: number;
  totalEmployees: number;
}

export interface LoginRequestDto {
  login: string;
  password: string;
  rememberMe?: boolean;
}

export interface SessionUserDto {
  id: string;
  login: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

export interface AuthSessionDto {
  user: SessionUserDto;
  accessToken: string;
  expiresAt: string;
}

export interface SystemNotificationDto {
  id: string;
  source: string;
  title: string;
  message: string;
  tone: "info" | "success" | "warning" | "danger";
  createdAt: string;
  entityType: string | null;
  entityId: string | null;
  navigateTo: string | null;
}

export interface SiteUserDto {
  id: string;
  login: string;
  displayName: string;
  roles: string[];
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  permissions: string[];
  directPermissions: string[];
}

export interface SiteUserAccessScopeDto {
  id: string;
  moduleKey: string;
  scopeType: string;
  scopeId: string;
  scopeName: string;
}

export interface SiteUserAccessDto {
  userId: string;
  roles: string[];
  directPermissions: string[];
  effectivePermissions: string[];
  scopes: SiteUserAccessScopeDto[];
}

export interface UpdateSiteUserPermissionsDto {
  permissionCodes: string[];
}

export interface SiteUserAccessScopeUpsertDto {
  moduleKey: string;
  scopeType: string;
  scopeId: string;
}

export interface UpdateSiteUserScopesDto {
  scopes: SiteUserAccessScopeUpsertDto[];
}

export interface RoleDto {
  id: string;
  code: string;
  name: string;
  permissions: string[];
}

export interface CreateSiteUserDto {
  login: string;
  displayName: string;
  roleCodes: string[];
  status: string;
  initialPassword?: string;
  permissionCodes?: string[];
}

export interface UpdateSiteUserDto {
  login: string;
  displayName: string;
  roleCodes: string[];
  status: string;
  permissionCodes?: string[];
}

export interface SiteUserCreatedDto {
  user: SiteUserDto;
  temporaryPassword: string;
}

export interface ResetSiteUserPasswordDto {
  temporaryPassword: string;
  resetAt: string;
}

export interface AssignmentDto {
  id: string;
  patrolRequestId: string;
  employeeId: string;
  employeeName: string;
  routeId: string;
  routeName: string;
  shift: string;
  status: string;
  plannedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  progressPercent: number;
  eta: string;
}

export interface AssignmentShiftSettingsDto {
  dayStart: string;
  dayEnd: string;
  nightStart: string;
  nightEnd: string;
}

export interface AssignmentSettingsDto {
  favoriteEmployeeIds: string[];
  shiftSettings: AssignmentShiftSettingsDto;
}

export interface UpdateAssignmentSettingsDto {
  favoriteEmployeeIds?: string[];
  shiftSettings?: AssignmentShiftSettingsDto;
}

export interface CreateAssignmentDto {
  patrolRequestId?: string;
  employeeId?: string;
  routeId?: string;
  plannedAt?: string;
  plannedEndAt?: string;
  priority?: "high" | "medium" | "low";
  shift?: string;
  notifyEmployee?: boolean;
  notificationText?: string;
  comment?: string;
}

export interface CompleteAssignmentDto {
  actualAt?: string;
  status?: string;
  routePointId?: string;
  comment?: string;
  issueType?: string;
  severity?: string;
  photos?: number;
  pointResults?: CompleteAssignmentPointDto[];
  photoAttachments?: CompleteAssignmentPhotoDto[];
}

export interface CompleteAssignmentPointDto {
  routePointId: string;
  status?: string;
  comment?: string;
  issueType?: string;
  severity?: string;
  photos?: number;
  photoAttachments?: CompleteAssignmentPhotoDto[];
}

export interface CompleteAssignmentPhotoDto {
  fileName: string;
  contentType: string;
  dataBase64: string;
}

export interface AssignmentCommandResultDto {
  assignment: AssignmentDto;
  changed: boolean;
  message: string;
}

export interface RouteDto {
  id: string;
  name: string;
  description: string;
  territory: string;
  status: string;
  duration: string;
  distance: string;
  periodicity: string;
  versionNo: number;
  points: RoutePointDto[];
}

export interface RoutePointDto {
  id: string;
  sequenceNo: number;
  name: string;
  zone: string;
  type: string;
  tag: string;
  interval: string;
  expectedTime: string;
  status: string;
  nfcCode: string | null;
  isRequired: boolean;
  requiresPhoto: boolean;
  description: string;
  instruction: string;
}

export interface CreateRouteDto {
  name: string;
  description: string;
  territory: string;
  status: string;
  duration: string;
  distance: string;
  periodicity: string;
}

export interface CreateRouteWithPointsDto {
  route: CreateRouteDto;
  points: CreateRoutePointDto[];
}

export type UpdateRouteDto = CreateRouteDto & { expectedVersionNo?: number };

export interface CreateRoutePointDto {
  name: string;
  zone: string;
  type: string;
  tag: string;
  interval: string;
  expectedTime: string;
  status: string;
  requiresPhoto: boolean;
  description: string;
  instruction: string;
}

export type UpdateRoutePointDto = CreateRoutePointDto;

export interface ReorderRoutePointDto {
  sequenceNo: number;
  expectedVersionNo?: number;
}

export interface EmployeeDto {
  id: string;
  fullName: string;
  personnelNo: string;
  position: string;
  department: string;
  employeeGroup: string;
  hiredAt: string | null;
  birthDate: string | null;
  status: string;
  shift: string;
  hasMobileAccount: boolean;
  lastSeenAt: string;
}

export interface CreateEmployeeDto {
  fullName: string;
  personnelNo: string;
  position: string;
  department: string;
  employeeGroup: string;
  hiredAt: string | null;
  birthDate: string | null;
  status: string;
  shift: string;
  hasMobileAccount: boolean;
}

export type UpdateEmployeeDto = CreateEmployeeDto;

export interface MobileAccountDto {
  id: string;
  login: string;
  passwordState: string;
  employee: string;
  employeeScope: "selected" | "all";
  boundEmployeeIds: string[];
  boundEmployees: string[];
  role: string;
  status: string;
  session: string;
  lastSeen: string;
  device: string;
  version: string;
}

export interface MobileAccountCreatedDto {
  account: MobileAccountDto;
  temporaryPassword: string | null;
}

export interface InventoryDbHealthIssueDto {
  key: string;
  severity: "critical" | "warning" | "info" | string;
  entity: string;
  count: number;
  title: string;
  description: string;
}

export interface InventoryDbHealthDto {
  createdAt: string;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  issues: InventoryDbHealthIssueDto[];
}

export interface CreateMobileAccountDto {
  employee?: string;
  employeeScope: "selected" | "all";
  login?: string;
  role: string;
  bindEmployee: boolean;
  restrictToBoundDevice: boolean;
  temporaryPassword: boolean;
  password?: string;
  confirmPassword?: string;
  status?: string;
  language?: string;
  requirePasswordChange?: boolean;
  restrictToLinkedDevices?: boolean;
}

export interface AttachMobileAccountEmployeeDto {
  employeeId?: string;
  employeeName?: string;
}

export interface AvailableEmployeeDto {
  id: string;
  fullName: string;
  role: string;
  department: string;
  area: string;
  avatarUrl: string | null;
}

export interface BindMobileAccountEmployeesDto {
  employeeIds: string[];
}

export interface ResetMobileAccountPasswordDto {
  temporaryPassword: string;
  resetAt: string;
}

export interface UpdateMobileAccountDto {
  login?: string;
  role?: string;
  status?: string;
}

export interface MobileAccountSessionDto {
  id: string;
  accountId: string;
  status: string;
  deviceId: string;
  device: string;
  platform: string;
  appVersion: string;
  ipAddress: string;
  lastSeenAt: string;
  startedAt: string;
  endedAt: string | null;
}

export interface MobileAccountSecurityEventDto {
  id: string;
  accountId: string;
  eventType: string;
  message: string;
  createdAt: string;
  actor: string;
}

export interface PatrolRequestDto {
  id: string;
  number: string;
  employeeId: string | null;
  employeeName: string;
  routeId: string | null;
  routeName: string;
  sourceResultId: string | null;
  scheduledDate: string;
  scheduledTime: string | null;
  notifyEmployee: boolean;
  notificationText: string;
  status: string;
  createdAt: string;
  description: string;
  assignmentId: string | null;
}

export interface CreatePatrolRequestDto {
  employeeName?: string;
  routeName?: string;
  employeeId?: string;
  routeId?: string;
  sourceResultId?: string;
  scheduledDate: string;
  scheduledTime?: string | null;
  plannedAt?: string | null;
  shift?: string | null;
  notifyEmployee: boolean;
  notificationText?: string;
  description?: string;
}

export interface ResultListItemDto {
  id: string;
  assignmentId: string | null;
  status: string;
  pointId: string | null;
  point: string;
  employeeId: string | null;
  employee: string;
  routeId: string | null;
  route: string;
  territory: string;
  shift: string;
  plannedAt: string;
  actualAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  deviation: string;
  comment: string;
  photos: number;
  issueType: string;
  severity: string;
}

export interface IssueDto {
  id: string;
  type: string;
  severity: string;
  message: string;
  createdAt: string;
}

export interface AttachmentMetadataDto {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ResultDetailDto extends ResultListItemDto {
  issues: IssueDto[];
  attachments: AttachmentMetadataDto[];
  chronology: string[];
}

export interface MobileSyncConflictListItemDto {
  clientOperationId: string;
  mobileAccountId: string;
  accountLogin: string;
  commandType: string;
  entityType: string;
  entityServerId?: string | null;
  message: string;
  payloadSnapshot?: unknown;
  createdAtServer: string;
  status: "open" | "accepted" | "rejected" | "repeatRequested" | string;
}

export interface MobileSyncConflictDetailDto extends MobileSyncConflictListItemDto {
  entityLocalId?: string | null;
  responseSnapshot?: unknown;
  createdAtLocal: string;
  attemptCount: number;
  operationStatus: string;
  resolutionComment?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
}

export interface MobileSyncConflictResolutionRequestDto {
  status: "accepted" | "rejected" | "repeatRequested";
  comment?: string | null;
}

export interface MobileSyncConflictResolutionDto {
  clientOperationId: string;
  mobileAccountId: string;
  status: string;
  comment?: string | null;
  resolvedBy: string;
  resolvedAt: string;
}

export interface MobileDeviceHealthDto {
  mobileAccountId: string;
  login: string;
  deviceId?: string | null;
  deviceName?: string | null;
  appVersion?: string | null;
  lastSeenAt?: string | null;
  pushStatus: string;
  pendingOutboxCount: number;
  staleOutboxCount: number;
  lastError?: string | null;
}

export interface InventoryOverviewDto {
  employeesTotal: number;
  itemsTotal: number;
  categoriesTotal: number;
  unitsTotal: number;
  warehousesTotal: number;
  criticalStockItems: number;
  activeIssues: number;
  activeCustodyRecords: number;
  ppeCardsTotal: number;
  reportsReady: number;
  attention: InventoryAttentionDto[];
}

export interface InventoryAttentionDto {
  id: string;
  title: string;
  description: string;
  tone: string;
  target: string;
}

export interface InventoryListResponseDto<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface InventoryItemDto {
  id: string;
  name: string;
  sku: string;
  categoryId: string | null;
  category: string;
  unitId: string | null;
  unit: string;
  balance: number;
  stockPhysical: number;
  stockReserved: number;
  stockAvailable: number;
  stockStatus: string;
  minStockQty: number | null;
  itemKind: string;
  normItemName: string;
  actualItemName: string;
  brandName: string;
  modelName: string;
  article: string;
  protectionClass: string;
  clothingSize: string;
  heightSize: string;
  shoeSize: string;
  headSize: string;
  gloveSize: string;
  respiratorSize: string;
  defaultLifeMonths: number | null;
  defaultUnitPriceMinor: number | null;
  trackingType: string;
  comment: string;
  isConsumable: boolean;
  trackLife: boolean;
  isActive: boolean;
  status: string;
}

export interface InventoryFacetDto {
  id: string;
  name: string;
  count: number;
}

export interface InventoryItemFacetsDto {
  total: number;
  active: number;
  inactive: number;
  categories: InventoryFacetDto[];
  units: InventoryFacetDto[];
  trackingTypes: InventoryFacetDto[];
  itemKinds: InventoryFacetDto[];
}

export interface InventoryStockBalanceDto {
  itemId: string;
  itemName: string;
  warehouseId: string;
  warehouseName: string;
  balance: number;
  stockPhysical: number;
  stockReserved: number;
  stockAvailable: number;
  unit: string;
  status: string;
}

export interface InventoryDocumentDto {
  id: string;
  number: string;
  type: string;
  employeeName: string;
  status: string;
  createdAt: string;
  itemName?: string;
  warehouseName?: string;
  quantity?: number;
  unit?: string;
  comment?: string;
}

export interface InventoryCustodyRecordDto {
  id: string;
  documentId: string;
  employeeName: string;
  itemName: string;
  warehouseName: string;
  quantity: number;
  status: string;
  issuedAt: string;
  closedAt: string | null;
  itemId: string;
  warehouseId: string;
  unit: string;
  comment: string;
  employeeId?: string | null;
  currentEmployeeId?: string | null;
  currentEmployeeName?: string;
  inventoryNumber?: string;
  serialNumber?: string;
  itemPriceMinor?: number | null;
  groupName?: string;
}

export interface InventoryCustodyDocumentDto {
  id: string;
  number: string;
  employeeName: string;
  status: string;
  createdAt: string;
  recordsCount: number;
}

export interface InventoryCustodyDocumentDetailDto {
  id: string;
  number: string;
  employeeId: string;
  employeeName: string;
  employeePersonnelNo: string;
  employeeDepartment: string;
  status: string;
  createdAt: string;
  closedAt: string | null;
  records: InventoryCustodyRecordDto[];
  history: InventoryHistoryDto[];
}


export interface InventoryCustodyModuleOptionsDto {
  employees: InventoryEmployeeDto[];
  items: InventoryItemDto[];
  warehouses: InventoryReferenceOptionDto[];
  custodyCategories: InventoryReferenceOptionDto[];
  documentStatuses: string[];
  recordStatuses: string[];
}

export interface CreateInventoryCustodyRecordDto {
  employeeId: string;
  itemId: string;
  warehouseId?: string | null;
  quantity: number;
  comment?: string | null;
  documentId?: string | null;
}

export interface UpdateInventoryStatusDto {
  status: string;
  comment?: string | null;
}

export interface TransferInventoryCustodyRecordDto {
  toEmployeeId?: string | null;
  employeeId?: string | null;
  transferredAt?: string | null;
  comment?: string | null;
  fromEmployeeId?: string | null;
  documentId?: string | null;
}

export interface InventoryPpeSummaryDto {
  total: number;
  active: number;
  issued: number;
  issuing: number;
  notIssued: number;
  partial: number;
  problem: number;
  returned: number;
  writtenOff: number;
  linesTotal: number;
  issuedLines: number;
  notIssuedLines: number;
}

export interface InventoryPpeCardsResponseDto extends InventoryListResponseDto<InventoryPpeCardDto> {
  summary: InventoryPpeSummaryDto;
  filteredSummary: InventoryPpeSummaryDto;
}

export interface InventoryPpeCardDto {
  id: string;
  employeeId: string;
  employeeName: string;
  position: string;
  status: string;
  linesCount: number;
  amountMinor: number;
  zeroPriceLines: number;
}

export interface InventoryPpeCardDetailDto {
  id: string;
  employeeId: string;
  employeeName: string;
  employeePersonnelNo: string;
  employeeDepartment: string;
  position: string;
  status: string;
  createdAt: string;
  comment?: string;
  employeeDetails: InventoryPpeEmployeeDetailsDto;
  lines: InventoryPpeCardLineDto[];
  version?: number;
  normSetId?: string | null;
  normRows?: InventoryPpeCardNormRowDto[];
}

export interface InventoryPpeEmployeeDetailsDto {
  gender: string;
  height: string;
  clothingSize: string;
  shoeSize: string;
  headSize: string;
  respiratorSize: string;
  handProtectionSize: string;
}

export interface InventoryPpeCardLineDto {
  id: string;
  itemId: string;
  itemName: string;
  warehouseId: string | null;
  warehouseName: string;
  quantity: number;
  unit: string;
  unitPriceMinor?: number | null;
  amountMinor?: number;
  status: string;
  issuedAt: string | null;
  dueAt: string | null;
  modelDescription: string;
  brandModelArticle: string;
  normPoint: string;
  printItemName?: string;
  issuePeriodText?: string;
  quantityText?: string;
  isSectionTitle?: boolean;
  cardNormRowId?: string | null;
  issueMethod?: string;
  sizeText?: string;
  returnedAt?: string | null;
  returnedQuantity?: number | null;
  writeOffActDate?: string | null;
  writeOffActNumber?: string;
}

export interface InventoryPpeNormSetDto {
  id: string;
  positionName: string;
  versionName: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceName: string;
  status: "draft" | "active" | "archived";
  requiresReview: boolean;
  version: number;
  rowsCount: number;
}

export interface InventoryPpeNormMappingDto {
  id: string;
  normRowId: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  brandModelArticle: string;
  defaultUnitPriceMinor: number | null;
  isDefault: boolean;
  comment: string;
}

export interface InventoryPpeCardNormRowDto {
  id: string;
  sourceNormRowId: string | null;
  parentRowId: string | null;
  rowType: "group" | "item";
  sortOrder: number;
  normItemName: string;
  normPoint: string;
  issuePeriodText: string;
  quantity: number;
  quantityText: string;
  lifeMonths: number | null;
  mappedItemId: string | null;
  mappedItemName: string;
  brandModelArticle: string;
  defaultUnitPriceMinor: number | null;
  coverageStatus: "not_issued" | "partial" | "issued" | "overdue";
  issuedQuantity: number;
  mappings: InventoryPpeNormMappingDto[];
}

export interface InventoryPpeWorkspaceDto {
  employee: InventoryEmployeeDto;
  card: InventoryPpeCardDetailDto | null;
  activeNormSet: InventoryPpeNormSetDto | null;
  normRows: InventoryPpeCardNormRowDto[];
  recentHistory: InventoryHistoryDto[];
  normsTotal: number;
  issued: number;
  notIssued: number;
  partial: number;
  overdue: number;
  errors: number;
}

export interface CreateInventoryPpeCardDraftDto {
  employeeId: string;
  cardDate: string;
  source: "active_norms" | "previous_card" | "empty";
  sourceCardId?: string | null;
  normSetId?: string | null;
  comment?: string | null;
  employeeDetails?: InventoryPpeEmployeeDetailsDto | null;
}

export interface UpsertInventoryPpeCardNormRowDto {
  id?: string | null;
  sourceNormRowId?: string | null;
  parentRowId?: string | null;
  rowType: "group" | "item";
  sortOrder: number;
  normItemName: string;
  normPoint: string;
  issuePeriodText: string;
  quantity: number;
  quantityText: string;
  lifeMonths?: number | null;
  mappedItemId?: string | null;
  brandModelArticle?: string | null;
  defaultUnitPriceMinor?: number | null;
}

export interface UpdateInventoryPpeCardNormRowsDto {
  expectedVersion: number;
  rows: UpsertInventoryPpeCardNormRowDto[];
}

export interface CreateInventoryPpeIssueDto {
  cardNormRowId: string;
  itemId: string;
  issuedAt: string;
  quantity: number;
  unitPriceMinor?: number | null;
  issueMethod: "personal" | "dispenser";
  sizeText?: string | null;
  brandModelArticle?: string | null;
  comment?: string | null;
  warehouseId?: string | null;
  expectedVersion?: number | null;
}

export interface ApplyInventoryPpeLineActionDto {
  action: "returned" | "written_off" | "defective";
  occurredAt: string;
  quantity?: number | null;
  comment?: string | null;
  writeOffActDate?: string | null;
  writeOffActNumber?: string | null;
  expectedVersion?: number | null;
}

export interface UpsertInventoryPpeNormMappingDto {
  itemId: string;
  brandModelArticle?: string | null;
  defaultUnitPriceMinor?: number | null;
  isDefault?: boolean;
  comment?: string | null;
}

export interface InventoryPpeHistoryRowDto {
  id: string;
  cardId: string;
  lineId: string;
  employeeId: string;
  employeeName: string;
  itemId: string;
  itemName: string;
  action: string;
  actionLabel: string;
  fromStatus: string;
  toStatus: string;
  quantity: number;
  unit: string;
  comment: string;
  actor: string;
  createdAt: string;
  cardNormRowId?: string | null;
  normItemName?: string;
}

export interface InventoryPpeMovementDto {
  cardId: string;
  lineId: string;
  employeeId: string;
  employeeName: string;
  employeePersonnelNo: string;
  employeeDepartment: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPriceMinor?: number | null;
  amountMinor: number;
  status: string;
  createdAt: string;
  issuedAt: string | null;
  returnedAt: string | null;
  writtenOffAt: string | null;
  dueAt: string | null;
  comment: string;
}

export interface InventoryPpeModuleOptionsDto {
  employees: InventoryEmployeeDto[];
  items: InventoryItemDto[];
  settings: InventorySettingsDto;
  statuses: string[];
}

export interface CreateInventoryPpeCardDto {
  employeeId: string;
  comment?: string | null;
  employeeDetails?: InventoryPpeEmployeeDetailsDto | null;
}

export interface UpsertInventoryPpeCardLineDto {
  itemId: string;
  warehouseId?: string | null;
  quantity: number;
  unitPriceMinor?: number | null;
  status?: string | null;
  dueAt?: string | null;
  issuedAt?: string | null;
  comment?: string | null;
  printItemName?: string | null;
  normPoint?: string | null;
  issuePeriodText?: string | null;
  quantityText?: string | null;
  isSectionTitle?: boolean | null;
  brandModelArticle?: string | null;
  cardNormRowId?: string | null;
  issueMethod?: string | null;
  sizeText?: string | null;
  returnedAt?: string | null;
  returnedQuantity?: number | null;
  writeOffActDate?: string | null;
  writeOffActNumber?: string | null;
}

export interface InventoryReportDto {
  id: string;
  title: string;
  description: string;
  format: string;
}

export interface InventoryHistoryDto {
  id: string;
  entityId?: string | null;
  entityType: string;
  action: string;
  description: string;
  actor: string;
  createdAt: string;
  employeeName?: string;
  itemName?: string;
}

export interface InventoryExportJobDto {
  id: string;
  reportId: string;
  format: string;
  status: string;
  createdAt: string;
  downloadName: string;
}

export interface InventoryLegacyImportTableDto {
  tableName: string;
  sourceRows: number;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  status: string;
  message: string;
}

export interface InventoryLegacyImportRunDto {
  id: string;
  dryRun: boolean;
  status: string;
  createdAt: string;
  completedAt: string | null;
  tablesScanned: number;
  rowsRead: number;
  rowsInserted: number;
  rowsUpdated: number;
  rowsSkipped: number;
  error: string;
  stockChecksum: string;
  tables: InventoryLegacyImportTableDto[];
}

export interface InventoryEmployeeImportResultDto {
  rowsRead: number;
  insertedRows: number;
  updatedRows: number;
  skippedRows: number;
  errors: string[];
}

export interface InventoryEmployeeImportPreviewDto {
  rowsRead: number;
  newRows: number;
  updateRows: number;
  skippedRows: number;
  newPositions: string[];
  newDepartments: string[];
  newGroups: string[];
  errors: string[];
  rows: InventoryEmployeeImportPreviewRowDto[];
  previewToken: string;
}

export interface InventoryEmployeeImportPreviewRowDto {
  rowNumber: number;
  fullName: string;
  personnelNo: string;
  position: string;
  department: string;
  employeeGroup: string;
  hiredAt: string | null;
  birthDate: string | null;
  changeType: "create" | "update" | "error" | string;
  error: string;
}

export interface InventoryEmployeeDto {
  id: string;
  fullName: string;
  personnelNo: string;
  position: string;
  department: string;
  status: string;
  employeeGroup: string;
  hiredAt: string | null;
  birthDate: string | null;
}

export interface InventoryUserDto {
  id: string;
  login: string;
  displayName: string;
  status: string;
  roles: string[];
}

export interface InventorySystemLogDto {
  id: string;
  entityType: string;
  entityId: string | null;
  action: string;
  details: string;
  actor: string;
  createdAt: string;
}

export interface InventoryReferenceOptionDto {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface InventoryItemSetDto {
  id: string;
  name: string;
  isActive: boolean;
  itemsCount: number;
}

export interface InventoryItemSetDetailDto {
  id: string;
  name: string;
  isActive: boolean;
  items: InventoryItemSetItemDto[];
}

export interface InventoryItemSetItemDto {
  id: string;
  quantity: number;
  item: InventoryItemDto;
}

export interface InventoryPositionNormDto {
  id: string;
  positionName: string;
  itemId: string;
  itemName: string;
  quantity: number;
  lifeMonths: number | null;
  normItemName?: string;
  normPoint?: string;
  issuePeriodText?: string;
  quantityText?: string;
  isSectionTitle?: boolean;
}

export interface CreateInventorySimpleReferenceDto {
  name: string;
}

export interface UpdateInventorySimpleReferenceDto {
  name: string;
  isArchived: boolean;
}

export interface CreateInventoryItemSetDto {
  name: string;
}

export interface UpdateInventoryItemSetDto {
  name: string;
  isArchived: boolean;
}

export interface UpsertInventoryItemSetItemsDto {
  items: UpsertInventoryItemSetItemDto[];
}

export interface UpsertInventoryItemSetItemDto {
  itemId: string;
  quantity: number;
}

export interface UpsertInventoryPositionNormDto {
  positionName: string;
  itemId: string;
  quantity: number;
  lifeMonths?: number | null;
  normItemName?: string | null;
  normPoint?: string | null;
  issuePeriodText?: string | null;
  quantityText?: string | null;
  isSectionTitle?: boolean | null;
}

export interface CreateInventoryCategoryDto {
  name: string;
  parentId?: string | null;
}

export interface UpdateInventoryCategoryDto {
  name: string;
  parentId?: string | null;
  isArchived: boolean;
}

export interface CreateInventoryUnitDto {
  name: string;
  symbol: string;
}

export interface UpdateInventoryUnitDto {
  name: string;
  symbol: string;
}

export interface CreateInventoryWarehouseDto {
  name: string;
  isDefault: boolean;
}

export interface UpdateInventoryWarehouseDto {
  name: string;
  isDefault: boolean;
  isArchived: boolean;
}

export interface UpsertInventoryItemDto {
  name: string;
  sku?: string | null;
  categoryId?: string | null;
  unitId?: string | null;
  itemKind?: string | null;
  normItemName?: string | null;
  actualItemName?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  article?: string | null;
  protectionClass?: string | null;
  clothingSize?: string | null;
  heightSize?: string | null;
  shoeSize?: string | null;
  headSize?: string | null;
  gloveSize?: string | null;
  respiratorSize?: string | null;
  defaultLifeMonths?: number | null;
  defaultUnitPriceMinor?: number | null;
  minStockQty?: number | null;
  isConsumable: boolean;
  trackLife: boolean;
  trackingType?: string | null;
  comment?: string | null;
  isActive: boolean;
}

export interface InventoryInitialStockDto {
  itemId: string;
  warehouseId: string;
  quantity: number;
  movedAt?: string | null;
  note?: string | null;
}

export interface CreateInventoryOperationDto {
  type: string;
  itemId: string;
  warehouseId?: string | null;
  quantity: number;
  employeeId?: string | null;
  movedAt?: string | null;
  comment?: string | null;
}

export interface InventoryOperationsModuleOptionsDto {
  employees: InventoryEmployeeDto[];
  items: InventoryItemDto[];
  settings: InventorySettingsDto;
  stock: InventoryStockBalanceDto[];
  operationTypes: string[];
}

export interface InventorySettingsDto {
  categories: InventoryReferenceOptionDto[];
  units: InventoryReferenceOptionDto[];
  warehouses: InventoryReferenceOptionDto[];
  custodyCategories: InventoryReferenceOptionDto[];
  returnReasons: InventoryReferenceOptionDto[];
  writeOffReasons: InventoryReferenceOptionDto[];
  itemSets: InventoryItemSetDto[];
  positionNorms: InventoryPositionNormDto[];
  employeePositions: InventoryReferenceOptionDto[];
  employeeDepartments: InventoryReferenceOptionDto[];
  employeeGroups: InventoryReferenceOptionDto[];
}

export interface EmuListResponseDto<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface EmuReferenceDto {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  sortOrder: number;
}

export interface EmuSettingsDto {
  sections: EmuReferenceDto[];
  waitReasons: EmuReferenceDto[];
  notCompletedReasons: EmuReferenceDto[];
  workTemplates: EmuWorkTemplateDto[];
  favoriteEmployees: EmuFavoriteEmployeeDto[];
}

export interface EmuWorkTemplateDto {
  id: string;
  name: string;
  description: string;
  sectionId: string | null;
  sectionName: string;
  isActive: boolean;
  sortOrder: number;
}

export interface EmuFavoriteEmployeeDto {
  id: string;
  employeeId: string;
  fullName: string;
  personnelNo: string;
  position: string;
  department: string;
  status: string;
  isActive: boolean;
  createdAt: string;
}

export interface EmuMetricDto {
  label: string;
  value: string;
  delta: string;
  tone: string;
  icon: string;
}

export interface EmuDashboardDto {
  metrics: EmuMetricDto[];
  activeWork: EmuWorkSessionDto[];
  forgottenWork: EmuWorkSessionDto[];
  recentEvents: EmuAuditEventDto[];
  weekPlan: EmuPlanTaskDto[];
}

export interface EmuWorkSessionDto {
  id: string;
  workNumber: string;
  workDate: string;
  sectionId: string;
  sectionName: string;
  createdByUserId?: string | null;
  createdByName?: string;
  planTaskId: string | null;
  taskDescription: string;
  status: string;
  operationalStatus: string;
  resultStatus: string;
  resultComment: string;
  arrivedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  deleteReason: string;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  rowVersion: number;
  isCarriedOver: boolean;
  source?: string;
  employees: EmuWorkSessionEmployeeDto[];
  attachments?: EmuWorkAttachmentDto[];
}

export interface EmuWorkAttachmentDto {
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  downloadUrl: string;
}

export interface EmuShiftRemarkDto {
  id: string;
  employeeId: string;
  employeeName: string;
  sectionId: string;
  sectionName: string;
  title: string;
  comment: string;
  status: string;
  createdAtLocal: string;
  createdAtServer: string;
  source: string;
  attachments: EmuWorkAttachmentDto[];
}

export interface EmuWorkSessionChangesDto {
  serverTime: string;
  changedSessions: EmuWorkSessionDto[];
  deletedSessionIds: string[];
}

export interface EmuWorkSessionEmployeeDto {
  id: string;
  employeeId: string;
  fullNameSnapshot: string;
  positionSnapshot: string;
  status: string;
  arrivedAt: string;
  finishedAt: string | null;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  participationStatus?: string;
  activeIntervalStartedAt?: string | null;
  personalWorkMinutes?: number;
  personalPauseMinutes?: number;
  currentPauseReason?: string;
  intervals?: EmuWorkParticipationIntervalDto[];
}

export interface EmuWorkParticipationIntervalDto {
  id: string;
  workSessionId: string;
  workSessionEmployeeId: string;
  employeeId: string;
  startedAt: string;
  endedAt: string | null;
  status: string;
  reason: string;
  createdByName: string;
  createdAt: string;
}

export interface EmuShiftTemplateDto {
  id: string;
  code: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  lunchStartTime: string;
  lunchEndTime: string;
  crossesMidnight: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface EmuEmployeeShiftDto {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftDate: string;
  shiftType: string;
  shiftTypeName: string;
  templateId: string | null;
  plannedStartAt: string;
  plannedEndAt: string;
  actualStartAt: string;
  actualEndAt: string;
  lunchStartAt: string;
  lunchEndAt: string;
  lunchTaken: boolean;
  lunchOverridden: boolean;
  source: string;
  reason: string;
  comment: string;
  adjustedByName: string;
  adjustedAt: string | null;
  rowVersion: number;
}

export interface EmuEmployeeShiftIntervalDto {
  type: string;
  label: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  workSessionId: string | null;
  workNumber: string;
  reason: string;
}

export interface EmuEmployeeShiftSummaryDto {
  shift: EmuEmployeeShiftDto;
  workMinutes: number;
  pauseMinutes: number;
  freeMinutes: number;
  beforeShiftWorkMinutes: number;
  overtimeMinutes: number;
  questionableOvertimeMinutes: number;
  intervals: EmuEmployeeShiftIntervalDto[];
  decisions: EmuDecisionDto[];
}

export interface EmuEmployeeMonthSummaryDto {
  employeeId: string;
  employeeName: string;
  month: string;
  shiftCount: number;
  plannedMinutes: number;
  presenceMinutes: number;
  workMinutes: number;
  pauseMinutes: number;
  freeMinutes: number;
  beforeShiftWorkMinutes: number;
  overtimeMinutes: number;
  questionableOvertimeMinutes: number;
  undertimeMinutes: number;
  shifts: EmuEmployeeShiftSummaryDto[];
}

export interface EmuDecisionDto {
  id: string;
  decisionType: string;
  severity: string;
  status: string;
  employeeId: string;
  employeeName: string;
  workSessionId: string | null;
  workNumber: string;
  sectionName: string;
  shiftDate: string;
  detectedAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolvedByName: string;
  dedupeKey: string;
  resolution: string;
  comment: string;
  rowVersion: number;
  overlapMinutes: number;
  lunchStartAt: string | null;
  lunchEndAt: string | null;
}

export interface EmuResolveDecisionDto {
  resolution:
    | "worked_through_lunch"
    | "exclude_lunch"
    | "confirmed_parallel_work"
    | "fixed_manually"
    | "handled_manually"
    | "false_alarm"
    | "confirmed_overtime"
    | "exclude_overtime";
  comment: string;
  rowVersion: number;
}

export interface EmuAuditEventDto {
  id: string;
  workSessionId: string | null;
  planTaskId: string | null;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  comment: string;
  actor: string;
  createdAt: string;
}

export interface EmuWorkSessionQueryDto {
  dateFrom: string | null;
  dateTo: string | null;
  employeeId: string | null;
  sectionId: string | null;
  waitReasonId: string | null;
  notCompletedReasonId: string | null;
  operationalStatus: string | null;
  resultStatus: string | null;
  status: string | null;
  problemOnly: boolean;
  manualCorrectionsOnly: boolean;
  includeDeleted: boolean;
  page: number;
  pageSize: number;
  sortBy: string | null;
  shiftType: string | null;
  employeeSearch: string | null;
  allowedSectionIds: string[] | null;
}

export interface EmuWorkHistoryReportDto {
  appliedQuery: EmuWorkSessionQueryDto;
  generatedAt: string;
  totals: EmuWorkHistoryTotalsDto;
  employees: EmuEmployeeWorkReportDto[];
  sections: EmuSectionWorkReportDto[];
  exceptions: EmuWorkHistoryExceptionDto[];
}

export interface EmuEmployeeWorkHistoryReportDto {
  appliedQuery: EmuWorkSessionQueryDto;
  generatedAt: string;
  employee: EmuEmployeeWorkReportDto;
  sections: EmuSectionWorkReportDto[];
  works: EmuListResponseDto<EmuWorkSessionDto>;
}

export interface EmuWorkHistoryTotalsDto {
  totalWorks: number;
  completedWorks: number;
  problemWorks: number;
  deletedWorks: number;
  employeeCount: number;
  sectionCount: number;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  totalMinutes: number;
  averageWorkMinutes: number;
}

export interface EmuEmployeeWorkReportDto {
  employeeId: string;
  employeeName: string;
  personnelNo: string;
  position: string;
  department: string;
  workCount: number;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  totalMinutes: number;
  sectionCount: number;
}

export interface EmuSectionWorkReportDto {
  sectionId: string;
  sectionName: string;
  workCount: number;
  employeeCount: number;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
  totalMinutes: number;
  problemWorks: number;
}

export interface EmuWorkHistoryExceptionDto {
  workSessionId: string;
  workNumber: string;
  workDate: string;
  sectionId: string;
  sectionName: string;
  reason: string;
  severity: string;
  workMinutes: number;
  waitingMinutes: number;
  otherWorkMinutes: number;
}

export interface EmuCreateWorkSessionDto {
  workDate: string;
  sectionId: string;
  arrivedAt?: string | null;
  employeeIds: string[];
  taskDescription: string;
  planTaskId?: string | null;
}

export interface EmuAddWorkSessionEmployeeDto {
  employeeId: string;
  startedAt?: string | null;
  comment: string;
  rowVersion: number;
}

export interface EmuFinishWorkSessionEmployeeDto {
  finishedAt?: string | null;
  participationStatus: string;
  comment: string;
  rowVersion: number;
}

export interface EmuMarkMistakenWorkSessionEmployeeDto {
  comment: string;
  rowVersion: number;
}

export interface EmuUpdateWorkSessionDto {
  sectionId: string;
  taskDescription: string;
  rowVersion: number;
  comment: string;
  workDate?: string | null;
  arrivedAt?: string | null;
  employeeIds?: string[] | null;
}

export interface EmuPauseWorkSessionDto {
  employeeIds: string[];
  waitReasonId: string;
  startedAt?: string | null;
  comment: string;
  markAsOtherWork?: boolean;
  rowVersion: number;
}

export interface EmuResumeWorkSessionDto {
  employeeIds: string[];
  resumedAt?: string | null;
  comment: string;
  rowVersion: number;
}

export interface EmuCompleteWorkSessionDto {
  employeeIds?: string[] | null;
  completedAt?: string | null;
  resultStatus: string;
  resultComment: string;
  notCompletedReasonId?: string | null;
  rowVersion: number;
}

export interface EmuDeleteWorkSessionDto {
  reason: string;
  rowVersion: number;
}

export interface EmuCarryOverWorkSessionDto {
  toDate: string;
  comment: string;
  rowVersion: number;
}

export interface EmuUpdateEmployeeShiftDto {
  shiftDate: string;
  shiftType: string;
  templateId?: string | null;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  lunchStartAt?: string | null;
  lunchEndAt?: string | null;
  lunchTaken: boolean;
  lunchOverridden: boolean;
  reason: string;
  comment?: string | null;
  rowVersion: number;
}

export interface EmuPlanTaskDto {
  id: string;
  title: string;
  description: string;
  plannedDate: string;
  sectionId: string | null;
  sectionName: string;
  status: string;
  approvalStatus: string;
  priority: string;
  isRecurring: boolean;
  recurrenceRule: string;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
  employeeIds: string[];
}

export interface EmuPlanTaskChangesDto {
  serverTime: string;
  changedTasks: EmuPlanTaskDto[];
  deletedTaskIds: string[];
}

export interface EmuUpsertPlanTaskDto {
  title: string;
  description: string;
  plannedDate: string;
  sectionId?: string | null;
  employeeIds: string[];
  priority: string;
  isRecurring: boolean;
  recurrenceRule: string;
  rowVersion?: number;
}

export interface EmuApprovePlanTaskDto {
  approved: boolean;
  comment: string;
  rowVersion: number;
}

export interface EmuReschedulePlanTaskDto {
  newPlannedDate: string;
  comment: string;
  rowVersion: number;
}

export interface EmuApproveWeekDto {
  weekStart: string;
  comment: string;
}

export interface EmuCreateReferenceDto {
  name: string;
  sortOrder?: number;
}

export interface EmuUpdateReferenceDto {
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface EmuCreateWorkTemplateDto {
  name: string;
  description: string;
  sectionId?: string | null;
  sortOrder?: number;
}

export interface EmuUpdateWorkTemplateDto {
  name: string;
  description: string;
  sectionId?: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface EmuAddFavoriteEmployeeDto {
  employeeId: string;
}

export interface PercoIntegrationSettingsDto {
  isEnabled: boolean;
  authMode: "LoginPassword" | "Token";
  baseUrl: string;
  username: string | null;
  hasPassword: boolean;
  hasToken: boolean;
  timezone: string;
  employeesSyncMinutes: number;
  eventsSyncMinutes: number;
  shiftStartToleranceMinutes: number;
  shiftEndToleranceMinutes: number;
  devPath: string;
  employeesEndpoint: string;
  eventsEndpoint: string;
  lastDiscoverySummary: string;
  lastConnectionCheckAt: string | null;
  lastConnectionStatus: string | null;
  lastConnectionError: string | null;
  secretStatus: PercoSecretStatusDto;
}

export interface UpdatePercoIntegrationSettingsDto {
  isEnabled: boolean;
  authMode?: "LoginPassword" | "Token" | null;
  baseUrl: string;
  username?: string | null;
  password?: string | null;
  token?: string | null;
  timezone: string;
  employeesSyncMinutes: number;
  eventsSyncMinutes: number;
  shiftStartToleranceMinutes: number;
  shiftEndToleranceMinutes: number;
  devPath?: string | null;
  employeesEndpoint?: string | null;
  eventsEndpoint?: string | null;
}

export interface PercoSecretStatusDto {
  apiStatus: string;
  apiCheckedAt: string | null;
  apiError: string | null;
  workerStatus: string;
  workerCheckedAt: string | null;
  workerError: string | null;
}

export interface PercoDiscoveredEndpointDto {
  kind: string;
  url: string;
  status: string;
}

export interface PercoConnectionTestResultDto {
  success: boolean;
  message: string;
  devPageAvailable: boolean;
  authAvailable: boolean;
  discoveredEndpoints: PercoDiscoveredEndpointDto[];
  checkedAt: string;
}

export interface PercoSyncResultDto {
  success: boolean;
  status: string;
  message: string;
  loaded: number;
  created: number;
  updated: number;
  inserted: number;
  duplicates: number;
  unmatched: number;
  errors: number;
  lastSyncAt: string | null;
}

export interface PercoIntegrationLogDto {
  id: string;
  operation: string;
  status: string;
  message: string;
  details: string;
  startedAt: string;
  finishedAt: string | null;
  createdByUserId: string | null;
}

export interface PercoUnmatchedEmployeeDto {
  percoEmployeeId: string;
  fullName: string;
  personnelNo: string;
  cardNumber: string;
  department: string;
  suggestedEmployeeId: string | null;
  suggestedEmployeeName: string;
}

export interface MatchPercoEmployeeDto {
  percoEmployeeId: string;
  employeeId?: string | null;
  action: "match" | "ignore";
}

export interface PercoAccessEventDiagnosticsDto {
  id: string;
  percoEventId: string;
  percoEmployeeId: string;
  employeeId: string | null;
  employeeName: string;
  personnelNo: string;
  deviceName: string;
  direction: "IN" | "OUT" | "UNKNOWN";
  directionLabel: string;
  zoneTransition: string;
  shiftMarker: string;
  eventAt: string;
}

export interface PercoPresenceIntervalDiagnosticsDto {
  id: string;
  employeeId: string;
  employeeName: string;
  personnelNo: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number;
  source: string;
  state: string;
  stateCode?: "inside" | "outside" | "lunch_break" | "stale" | "old_open" | string;
  needsReview?: boolean;
  analysisReason?: string;
  suggestedAction?: string;
  analysisConfidence?: number;
}

export interface ClosePercoPresenceIntervalDto {
  endedAt: string;
  comment: string;
}

export interface PercoDiagnosticsDto {
    generatedAt: string;
    windowStart: string;
    windowEnd: string;
    recentEventsCount: number;
    openPresenceCount: number;
  closedPresenceCount: number;
  oldOpenPresenceCount: number;
  unmatchedEventsCount: number;
  recentEvents: PercoAccessEventDiagnosticsDto[];
  presenceIntervals: PercoPresenceIntervalDiagnosticsDto[];
}
