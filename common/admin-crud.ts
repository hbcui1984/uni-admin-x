import { computed, getCurrentInstance, nextTick, ref, shallowRef } from 'vue';
import { onHide, onLoad, onReady, onShow, onUnload } from '@dcloudio/uni-app';
import menuValidator from '@/js_sdk/validator/opendb-admin-menus.js';
import { validator as permissionValidator } from '@/js_sdk/validator/uni-id-permissions.js';
import { validator as roleValidator } from '@/js_sdk/validator/uni-id-roles.js';
import { validator as userValidator, enumConverter } from '@/js_sdk/validator/uni-id-users.js';
import { validator as tagValidator } from '@/js_sdk/validator/uni-id-tag.js';
import { identity, hasPermission, currentRoute, LOGIN_URL } from '@/common/admin-navigation';
import type { RemoveUsersResponse } from '@/common/admin-user-types';

type Kind = 'menu' | 'permission' | 'role' | 'user' | 'tag' | 'app';
type Row = Record<string, any>;
type Choice = { value: string; text: string; checked?: boolean };
type AdminMutationResponse = { errCode: number | string; errMsg?: string };
type FormHandle = { validate(): Promise<Row>; setRules(rules: Row): void; setValue?(field: string, value: unknown): void };
type PopupHandle = { open(): void; close(): void };
type TableHandle = { clearSelection(): void };
type DatabaseListHandle = { dataList: Row[]; loadData(options: UTSJSONObject): void };
const collections = { menu: 'opendb-admin-menus', permission: 'uni-id-permissions', role: 'uni-id-roles', user: 'uni-id-users', tag: 'uni-id-tag', app: 'opendb-app-list' };

type AdminDatabase = ReturnType<typeof uniCloud.databaseForJQL>;

export function useAdminAccess() {
  const proxy = getCurrentInstance()?.proxy as any;
  const accessReady = ref(false);
  const database = shallowRef<AdminDatabase | null>(null);
  let loaded = false;
  let target = '';
  let redirecting = false;
  let sessionKey = '';
  let configuration: unknown;
  let warned = false;
  const checkAccess = () => {
    if (!loaded) return false;
    const config = uniCloud.config;
    const user = config ? identity() : null;
    if (!user?.uid || user.tokenExpired <= Date.now()) {
      accessReady.value = false;
      database.value = null;
      sessionKey = '';
      if (!redirecting) {
        redirecting = true;
        uni.redirectTo({
          url: `${LOGIN_URL}?uniIdRedirectUrl=${encodeURIComponent(target)}`,
          fail: () => { redirecting = false; },
        });
      }
      return false;
    }
    if (!config || typeof uniCloud.databaseForJQL !== 'function') {
      accessReady.value = false;
      database.value = null;
      if (!warned) {
        warned = true;
        uni.showToast({ title: '云空间或客户端 JQL 尚未配置，暂无法访问', icon: 'none' });
      }
      return false;
    }
    try {
      const key = `${user.uid}:${user.tokenExpired}`;
      if (!database.value || sessionKey !== key || configuration !== config) {
        database.value = uniCloud.databaseForJQL();
        sessionKey = key;
        configuration = config;
      }
      accessReady.value = true;
      redirecting = false;
      return true;
    } catch (error) {
      accessReady.value = false;
      database.value = null;
      if (!warned) { warned = true; reportAdminError(error); }
      return false;
    }
  };
  onLoad(query => {
    const params = Object.entries(query || {}).filter(([, value]) => value != null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
    const pages = getCurrentPages();
    const page = pages[pages.length - 1] as any;
    target = proxy?.$route?.fullPath || page?.$page?.fullPath || (currentRoute() + (params ? `?${params}` : ''));
    loaded = true;
    checkAccess();
  });
  onShow(checkAccess);
  return { accessReady, checkAccess, getDatabase: () => checkAccess() ? database.value : null };
}

export function reportAdminError(error: unknown) {
  const err = error as { message?: string; errMsg?: string };
  uni.showModal({ content: err?.errMsg || err?.message || '请求服务失败', showCancel: false });
}

export function literalSearch(value: string) {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&').replace(/[\r\n\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')), 'i');
}

export function adminWhere(query: string, fields: string[], filters: Row = {}) {
  const clauses: string[] = [];
  if (query.trim()) clauses.push('(' + fields.map(field => `${literalSearch(query.trim())}.test(${field})`).join(' || ') + ')');
  for (const field of Object.keys(filters)) {
    if (!/^[a-zA-Z_][\w.]*$/.test(field)) continue;
    const { type, value } = filters[field];
    if (type === 'search' && typeof value === 'string' && value) clauses.push(`${literalSearch(value)}.test(${field})`);
    if (type === 'select' && Array.isArray(value) && value.length) clauses.push(`${field} in ${JSON.stringify(value)}`);
    if (['range', 'timestamp', 'date'].includes(type) && Array.isArray(value) && value.length === 2) {
      const bounds = type === 'date' ? value.map(v => new Date(v).getTime()) : value.map(Number);
      if (bounds.every(Number.isFinite)) clauses.push(`(${field} >= ${bounds[0]} && ${field} <= ${bounds[1]})`);
    }
  }
  return clauses.join(' && ');
}

async function readAdminChoices(getDatabase: () => AdminDatabase | null, collection: string, valueField: string, textField: string): Promise<Choice[]> {
  const choices: Choice[] = [];
  for (let offset = 0; ; offset += 500) {
    const db = getDatabase();
    if (!db) throw new Error('访问已失效');
    const res = await db.collection(collection).field(`${valueField},${textField}`).orderBy('_id asc').skip(offset).limit(500).get();
    const rows = res.data as Row[];
    choices.push(...rows.map(item => ({ value: item[valueField], text: item[textField] })));
    if (rows.length < 500) return choices;
  }
}

export function useAdminForm(kind: Exclude<Kind, 'app'>, editing: boolean) {
  const { accessReady, checkAccess, getDatabase } = useAdminAccess();
  const proxy = getCurrentInstance()!.proxy as any;
  const initial: Row = kind === 'menu' ? { menu_id: '', name: '', icon: '', url: '', sort: 0, parent_id: '', permission: [], enable: true }
    : kind === 'permission' ? { permission_id: '', permission_name: '', comment: '' }
    : kind === 'role' ? { role_id: '', role_name: '', permission: [], comment: '' }
    : kind === 'tag' ? { tagid: '', name: '', description: '' }
    : { username: '', nickname: '', password: '', role: [], tags: [], authorizedApp: [], mobile: '', email: '', status: 0 };
  const formData = ref<Row>({ ...initial });
  const formDataId = ref('');
  const formRef = ref<FormHandle | null>(null);
  const iconPopupRef = ref<PopupHandle | null>(null);
  const roles = ref<Choice[]>([]);
  const permissionChoices = ref<Choice[]>([]);
  const tagChoices = ref<Choice[]>([]);
  const appList = ref<Choice[]>([]);
  const unknownAppids = ref<string[]>([]);
  const userId = ref('');
  const showPassword = ref(false);
  const submitting = ref(false);
  const detailReady = ref(!editing);
  let formOwner = '';
  const canSubmit = () => accessReady.value && (kind !== 'user' || (identity().tokenExpired > Date.now() && identity().role.includes('admin')));
  const validators = { menu: menuValidator, permission: permissionValidator, role: roleValidator, user: userValidator, tag: tagValidator };
  const rules = computed(() => {
    const result: Row = {};
    for (const field of Object.keys(initial)) {
      const validator = (validators[kind] as Row)[field];
      if (validator && field !== 'status' && (field !== 'password' || !editing || (showPassword.value && !!formData.value.password))) result[field] = validator;
    }
    return result;
  });
  const binddata = (field: string, value: any) => {
    formData.value[field] = kind === 'user' && field === 'status' ? (value ? 0 : 1) : value;
    formRef.value?.setValue?.(field, formData.value[field]);
  };
  const refreshChoices = async () => {
    if (!checkAccess()) return;
    try {
      if (kind === 'menu' || kind === 'role') {
        const choices = await readAdminChoices(getDatabase, 'uni-id-permissions', 'permission_id', 'permission_name');
        if (checkAccess()) permissionChoices.value = choices;
        return;
      }
      if (kind !== 'user') return;
      const roleOptions = await readAdminChoices(getDatabase, 'uni-id-roles', 'role_id', 'role_name');
      if (!checkAccess()) return;
      roles.value = roleOptions;
      if (!roles.value.some(item => item.value === 'admin')) roles.value.unshift({ value: 'admin', text: '超级管理员' });
      const tags = await readAdminChoices(getDatabase, 'uni-id-tag', 'tagid', 'name');
      const list = await readAdminChoices(getDatabase, 'opendb-app-list', 'appid', 'name');
      const currentApp = uni.getAppBaseInfo();
      if (currentApp.appId && !list.some(item => item.value === currentApp.appId)) {
        list.unshift({ value: currentApp.appId, text: currentApp.appName || '当前后台' });
      }
      if (!checkAccess()) return;
      tagChoices.value = tags;
      unknownAppids.value = (formData.value.authorizedApp || []).filter((id: string) => !list.some(item => item.value === id));
      unknownAppids.value.forEach(id => list.push({ value: id, text: `未知应用${id}` }));
      appList.value = list;
    } catch (err) { if (accessReady.value) reportAdminError(err); }
  };
  const submit = async () => {
    if (!checkAccess()) return;
    if (identity().uid !== formOwner) return reportAdminError(new Error('登录账号已变化，请重新打开表单'));
    if (!canSubmit()) return reportAdminError(new Error('当前账号没有维护用户的权限'));
    if (submitting.value || !detailReady.value) return;
    if (!formRef.value) return reportAdminError(new Error('表单尚未就绪'));
    submitting.value = true;
    let validated = false;
    try {
      formRef.value.setRules(rules.value);
      const validatedValue = await formRef.value.validate();
      if (identity().uid !== formOwner) throw new Error('登录账号已变化，请重新打开表单');
      const db = getDatabase();
      if (!db) { submitting.value = false; return; }
      validated = true;
      const value: Row = {};
      Object.keys(initial).forEach(field => { value[field] = validatedValue?.[field] ?? formData.value[field]; });
      if (kind === 'menu') {
        value.sort = value.sort === '' || value.sort == null ? 0 : Number(value.sort);
        if (!Number.isInteger(value.sort)) throw new Error('序号必须是整数');
        if (value.parent_id === value.menu_id) throw new Error('父菜单不能是当前菜单');
      }
      uni.showLoading({ title: '提交中...', mask: true });
      if (kind === 'user') {
        if (!value.password || (editing && !showPassword.value)) delete value.password;
        if (!editing && !value.mobile) delete value.mobile;
        if (!editing && !value.email) delete value.email;
        if (editing) value.uid = formDataId.value;
        if (editing && formDataId.value === userId.value) { delete value.status; delete value.role; }
        const co = uniCloud.importObject('uni-id-co');
        const res = editing ? await co.updateUser<AdminMutationResponse>(value) : await co.addUser<AdminMutationResponse>(value);
        if (res.errCode) throw new Error(res.errMsg || String(res.errCode));
      } else if (editing) {
        await db.collection(collections[kind]).doc(formDataId.value).update(value);
      } else {
        await db.collection(collections[kind]).add(value);
      }
      if (!checkAccess()) return;
      uni.showToast({ title: editing ? '修改成功' : '新增成功' });
      if (kind === 'menu') uni.$emit('uni-admin-menus-changed');
      proxy.getOpenerEventChannel?.()?.emit?.('refreshData');
      if (kind === 'tag') proxy.getOpenerEventChannel?.()?.emit?.('refreshCheckboxData');
      setTimeout(() => uni.navigateBack(), 500);
    } catch (err) {
      if (validated || !Array.isArray(err)) reportAdminError(err);
      submitting.value = false;
    } finally { uni.hideLoading(); }
  };
  onLoad(async (query) => {
    const db = getDatabase();
    if (!db) return;
    userId.value = identity().uid;
    formOwner = userId.value;
    if (!editing && kind === 'menu') formData.value.parent_id = query?.parent_id || '';
    if (editing) {
      formDataId.value = query?.id || '';
      if (!formDataId.value) return reportAdminError(new Error('缺少记录 ID'));
      try {
        const fields = kind === 'user' ? 'username,nickname,role,tags,dcloud_appid as authorizedApp,mobile,email,status' : Object.keys(initial).join(',');
        const res = await db.collection(collections[kind]).doc(formDataId.value).field(fields).get();
        const data = (res.data as Row[])[0];
        if (!checkAccess()) return;
        if (!data) throw new Error('记录不存在或无权访问');
        Object.keys(initial).forEach(field => { if (data[field] != null) formData.value[field] = data[field]; });
        detailReady.value = true;
      } catch (err) { reportAdminError(err); }
    }
    await refreshChoices();
  });
  onReady(() => { if (checkAccess()) formRef.value?.setRules(rules.value); });
  let shown = false;
  onShow(() => { if (shown) refreshChoices(); shown = true; });
  return {
    accessReady,
    formData, formDataId, formRef, rules, roles, permissionChoices, tagChoices, appList, userId, showPassword, submitting, detailReady,
    iconPopupRef, binddata, submit, submitForm: submit, canSubmit,
    unknownAppidsCom: computed(() => unknownAppids.value.join('、')),
    showIconPopup: () => iconPopupRef.value?.open(),
    trigger: () => { showPassword.value = !showPassword.value; formData.value.password = ''; },
    gotoAppList: () => { if (checkAccess()) uni.navigateTo({ url: '../app/list', fail: () => uni.showToast({ title: '应用管理页面暂不可用', icon: 'none' }) }); },
    gotoTagList: () => { if (checkAccess()) uni.navigateTo({ url: '../tag/list', fail: () => uni.showToast({ title: '标签管理页面暂不可用', icon: 'none' }) }); },
    gotoTagAdd: () => { if (checkAccess()) uni.navigateTo({ url: '../tag/add', events: { refreshCheckboxData: refreshChoices }, fail: () => uni.showToast({ title: '新增标签页面暂不可用', icon: 'none' }) }); },
    parseUserStatus: (status: number) => ['启用', '禁用', '审核中', '审核拒绝', '已注销'][status] || '未知',
  };
}

export function useAdminList(kind: 'permission' | 'role' | 'user' | 'tag' | 'app') {
  const { accessReady, checkAccess, getDatabase } = useAdminAccess();
  const proxy = getCurrentInstance()!.proxy as any;
  const udbRef = ref<DatabaseListHandle | null>(null);
  const tableRef = ref<TableHandle | null>(null);
  const batchSmsRef = ref<Pick<PopupHandle, 'open'> | null>(null);
  const query = ref('');
  const where = ref('');
  const orderby = ref(kind === 'user' ? 'last_login_date desc' : 'create_date desc');
  const selectedIndexs = ref<number[]>([]);
  const pageRows = ref<Row[]>([]);
  const filters = ref<Row>({});
  const tags = ref<Record<string, string>>({});
  const managerTags = ref<string[]>([]);
  const busy = ref(false);
  const confirmingDelete = ref(false);
  const tagsDialogOpen = ref(false);
  const tagsLoading = ref(false);
  const tagsError = ref('');
  const tagTargetIds = ref<string[]>([]);
  let tagOwner = '';
  let tagRequest = 0;
  let active = true;
  let listOwner = '';
  let ready = false;
  const queryTagid = ref('');
  const smsCondition = ref<Row>({});
  const options = ref({ pageSize: 20, pageCurrent: 1, ...enumConverter, status_valuetotext: { ...enumConverter.status_valuetotext, 4: '已注销' }, filterData: { status_localdata: [0, 1, 2, 3, 4].map((value, i) => ({ value, text: ['正常', '禁用', '审核中', '审核拒绝', '已注销'][i] })) } });
  const exportExcelData = ref<Row[]>([]);
  const exportExcel = { filename: `${collections[kind]}.xls`, type: 'xls', fields: kind === 'permission' ? { 权限ID: 'permission_id', 权限名称: 'permission_name', 备注: 'comment' } : kind === 'role' ? { 唯一ID: 'role_id', 名称: 'role_name', 权限: 'permission', 备注: 'comment', create_date: 'create_date' } : kind === 'tag' ? { 标签的tagid: 'tagid', 标签名称: 'name', 标签描述: 'description' } : kind === 'app' ? { AppID: 'appid', 应用类型: 'app_type', 应用名称: 'name', 应用描述: 'description', 创建时间: 'create_date' } : { 用户名: 'username', 手机号码: 'mobile', 用户状态: 'status', 邮箱: 'email', 角色: 'role', last_login_date: 'last_login_date' } };
  const collectionList = computed(() => {
    if (!accessReady.value) return [];
    const db = getDatabase();
    if (!db) return [];
    return kind === 'role' ? [db.collection('uni-id-roles').field('comment,permission,role_id,role_name,create_date').getTemp(), db.collection('uni-id-permissions').field('permission_name,permission_id').getTemp()] : kind === 'user' ? [db.collection('uni-id-users').field('ali_openid,apple_openid,avatar,avatar_file,comment,dcloud_appid,department_id,email,email_confirmed,gender,invite_time,inviter_uid,last_login_date,last_login_ip,mobile,mobile_confirmed,my_invite_code,nickname,role,score,status,username,wx_unionid,qq_unionid,tags').getTemp(), db.collection('uni-id-roles').field('role_id,role_name').getTemp()] : [];
  });
  const searchFields = kind === 'permission' ? ['permission_id', 'permission_name'] : kind === 'role' ? ['role_id', 'role_name', 'permission.permission_name'] : kind === 'tag' ? ['tagid', 'name', 'description'] : kind === 'app' ? ['appid', 'name', 'description', 'remark'] : ['username', 'nickname', 'role.role_name', 'mobile', 'email'];
  function closeTagsPopup() {
    if (busy.value) return;
    tagsDialogOpen.value = false;
    tagTargetIds.value = [];
    managerTags.value = [];
  }
  const resetSelection = () => { closeTagsPopup(); selectedIndexs.value = []; tableRef.value?.clearSelection(); };
  const loadData = (clear = true) => {
    if (!checkAccess()) return;
    resetSelection();
    pageRows.value = [];
    if (clear) options.value.pageCurrent = 1;
    listOwner = identity().uid;
    udbRef.value?.loadData(new UTSJSONObject({ clear, current: options.value.pageCurrent }));
  };
  const rebuildWhere = () => { where.value = adminWhere(query.value, searchFields, filters.value); nextTick(() => loadData()); };
  const selectedItems = (): string[] => selectedIndexs.value.map(i => pageRows.value[i]?._id).filter(Boolean);
  const canWriteUsers = () => checkSession() && listOwner === identity().uid && identity().role.includes('admin');
  function checkSession() { const user = identity(); return !!user.uid && user.tokenExpired > Date.now(); }
  const isCurrentUser = (id: string) => id === identity().uid;
  const canDeleteUser = (id: string) => typeof id === 'string' && !!id && checkSession() && listOwner === identity().uid && pageRows.value.some(row => row._id === id) && !isCurrentUser(id) && hasPermission('DELETE_UNI_ID_USERS');
  const canDeleteSelectedUsers = computed(() => !busy.value && !confirmingDelete.value && selectedIndexs.value.length > 0 &&
    selectedItems().length === selectedIndexs.value.length && selectedItems().every(canDeleteUser));
  const canManageSelectedTags = computed(() => !busy.value && selectedIndexs.value.length > 0 && selectedItems().length === selectedIndexs.value.length && listOwner === identity().uid && hasPermission('UPDATE_UNI_ID_USERS'));
  const remove = (input: string[]) => {
    const ids = [...new Set(input)];
    if (!checkAccess()) return;
    if (!ids.length || busy.value || confirmingDelete.value) return;
    const owner = identity().uid;
    if (kind === 'user') {
      if (ids.includes(owner)) return reportAdminError(new Error('不能删除当前登录账号'));
      if (listOwner !== owner) return reportAdminError(new Error('列表账号已变化，请刷新后重新操作'));
      if (!ids.every(canDeleteUser)) return reportAdminError(new Error('没有删除用户的权限'));
      if (!ids.every(id => pageRows.value.some(row => row._id === id))) return reportAdminError(new Error('列表已变化，请刷新后重新选择'));
    }
    confirmingDelete.value = true;
    uni.showModal({ title: '提示', content: `确认删除选中的 ${ids.length} 条记录？` + (kind === 'app' ? '仅删除应用记录，不删除关联版本等数据。' : ''), success: async res => {
      if (!res.confirm || busy.value) return;
      if (identity().uid !== owner || !checkAccess()) return reportAdminError(new Error('登录账号已变化，请重新选择记录'));
      if (kind === 'user' && !ids.every(canDeleteUser)) return reportAdminError(new Error('当前账号或权限已变化，删除已取消'));
      const db = getDatabase();
      if (!db) return;
      busy.value = true;
      try {
        if (kind === 'user') {
          const api = uniCloud.importObject('uni-admin-co', { customUI: true });
          const result = await api.removeUsers<RemoveUsersResponse>(ids);
          if (result.errCode !== 0 || result.deletedCount !== ids.length) throw new Error(result.errMsg || '删除结果无法确认，请刷新列表核查');
        } else await db.collection(collections[kind]).where(`_id in ${JSON.stringify(ids)}`).remove();
        if (!active || identity().uid !== owner) return;
        loadData();
      } catch (err) {
        if (active && identity().uid === owner) { reportAdminError(err); if (kind === 'user') loadData(false); }
      } finally { busy.value = false; }
    }, complete: () => { confirmingDelete.value = false; } });
  };
  const loadTags = async () => {
    if (kind !== 'user' || !checkAccess()) return;
    const request = ++tagRequest;
    const owner = identity().uid;
    tagsLoading.value = true;
    tagsError.value = '';
    try {
      const choices = await readAdminChoices(getDatabase, 'uni-id-tag', 'tagid', 'name');
      if (!active || request !== tagRequest || identity().uid !== owner || !checkAccess()) return;
      tags.value = Object.fromEntries(choices.map(item => [item.value, item.text]));
    } catch (_) {
      if (active && request === tagRequest && identity().uid === owner) tagsError.value = '标签加载失败，请检查读取权限或网络后重试';
    } finally { if (request === tagRequest) tagsLoading.value = false; }
  };
  async function openTagsPopup() {
    if (!checkAccess() || !canManageSelectedTags.value) return;
    const ids = selectedItems();
    if (!ids.length || ids.length !== selectedIndexs.value.length) return reportAdminError(new Error('列表已变化，请重新选择用户'));
    tagOwner = identity().uid;
    tagTargetIds.value = [...new Set(ids)];
    managerTags.value = [];
    tagsDialogOpen.value = true;
    await loadTags();
  }
  const managerMultiTag = (clear = false) => {
    if (!tagsDialogOpen.value || busy.value || tagsLoading.value || tagsError.value || !tagTargetIds.value.length) return;
    if (!checkAccess() || identity().uid !== tagOwner || !hasPermission('UPDATE_UNI_ID_USERS')) {
      closeTagsPopup(); return reportAdminError(new Error('登录账号或权限已变化，请重新打开标签管理'));
    }
    const values = clear ? [] : [...managerTags.value];
    if (!clear && (!values.length || values.some(value => !Object.prototype.hasOwnProperty.call(tags.value, value)))) return;
    const ids = [...tagTargetIds.value];
    const owner = tagOwner;
    busy.value = true;
    uni.showModal({
      title: clear ? '确认清空标签' : '确认替换标签',
      content: clear ? `将清空 ${ids.length} 位用户的全部标签，是否继续？` : `将 ${ids.length} 位用户的现有标签替换为勾选的 ${values.length} 个标签，是否继续？`,
      success: async confirmation => {
        if (!confirmation.confirm) { busy.value = false; return; }
        if (!active || !tagsDialogOpen.value || identity().uid !== owner || !checkAccess() || !hasPermission('UPDATE_UNI_ID_USERS')) {
          busy.value = false; closeTagsPopup(); return reportAdminError(new Error('登录账号或权限已变化，标签修改已取消'));
        }
        try {
          const db = getDatabase();
          if (!db) return;
          const response = await db.collection('uni-id-users').where(`_id in ${JSON.stringify(ids)}`).update({ tags: values });
          if (response.errCode) throw new Error(response.errMsg || '保存标签失败');
          if (!active || identity().uid !== owner) return;
          busy.value = false;
          closeTagsPopup();
          loadData(false);
          uni.showToast({ title: clear ? '标签已清空' : '标签已保存' });
        } catch (err) { if (active && identity().uid === owner) reportAdminError(err); }
        finally { busy.value = false; }
      },
      fail: () => { busy.value = false; }
    });
  };
  function addTagFromDialog() {
    if (busy.value || !checkAccess() || !hasPermission('CREATE_UNI_ID_TAG')) return;
    closeTagsPopup();
    uni.navigateTo({ url: '/pages/system/tag/add', events: { refreshData: loadTags } });
  }
  onLoad(params => {
    if (!checkAccess()) return;
    if (kind !== 'user') return;
    if (params?.tagid) { queryTagid.value = params.tagid; filters.value.tags = { type: 'select', value: [params.tagid] }; }
    if (params?.id) filters.value._id = { type: 'select', value: [params.id] };
    where.value = adminWhere(query.value, searchFields, filters.value);
  });
  onReady(async () => { if (!checkAccess()) return; await loadTags(); await nextTick(); ready = true; loadData(); });
  onShow(() => {
    active = true;
    if (ready && listOwner && listOwner !== identity().uid) {
      tags.value = {}; exportExcelData.value = []; resetSelection();
      if (checkAccess()) void loadTags().then(() => loadData());
    }
  });
  onHide(() => { active = false; tagRequest++; tagsDialogOpen.value = false; tagTargetIds.value = []; managerTags.value = []; });
  onUnload(() => { active = false; tagRequest++; });
  return {
    accessReady,
    query, where, orderby, options, udbRef, tableRef, batchSmsRef, selectedIndexs, collectionList, pageRows,
    canWriteUsers, isCurrentUser, canDeleteUser, canDeleteSelectedUsers, canManageSelectedTags, busy,
    tagsDialogOpen, tagsLoading, tagsError, tagTargetIds, closeTagsPopup, retryTags: loadTags, addTagFromDialog,
    exportExcel, exportExcelData, managerTags, smsCondition, managerMultiTag,
    tagsData: computed(() => Object.keys(tags.value).map(value => ({ value, text: tags.value[value], checked: queryTagid.value === value }))),
    tagChoices: computed(() => Object.keys(tags.value).map(value => ({ value, text: tags.value[value] }))),
    smsReceiver: computed(() => kind === 'tag' ? selectedIndexs.value.map(i => pageRows.value[i]?.tagid).filter(Boolean) : selectedIndexs.value.length ? selectedItems() : undefined),
    noAppidWhatShouldIDoLink: 'https://uniapp.dcloud.net.cn/uniCloud/uni-id?id=makeup-dcloud-appid',
    openTagsPopup,
    onqueryload: (data: Row[]) => {
      if (!checkAccess() || listOwner !== identity().uid) { data.splice(0); pageRows.value = []; return; }
      // dataList 是框架 Element 的初始数组引用，replace 分页后以 load 事件为准。
      pageRows.value = data.map(item => ({ ...item }));
      data.forEach(item => {
        if (kind === 'role') item.permission = (item.permission || []).map((p: Row | string) => typeof p === 'string' ? p : p.permission_name || p.permission_id).join('、');
        if (kind === 'user') {
          item.status = item.status ?? 0;
          item.role = (item.role || []).map((r: Row | string) => typeof r === 'string' ? r : r.role_name || r.role_id).join('、');
          item.tags = (item.tags || []).map((id: string) => tags.value[id] || id);
          if (Array.isArray(item.dcloud_appid)) item.dcloud_appid = item.dcloud_appid.join('、');
        }
      });
      exportExcelData.value = data.map(item => ({ ...item, create_date: proxy.$formatDate(item.create_date), last_login_date: proxy.$formatDate(item.last_login_date) }));
    },
    loadData,
    search: rebuildWhere,
    changeSize: (size: number) => { options.value.pageSize = Math.max(1, Math.min(500, Number(size) || 20)); nextTick(() => loadData()); },
    onPageChanged: (event: { current: number }) => { options.value.pageCurrent = event.current; loadData(false); },
    selectionChange: (event: { detail: { index: number[] } }) => { selectedIndexs.value = event.detail.index; },
    navigateTo: (url: string, clear = true) => { if (checkAccess()) uni.navigateTo({ url, events: { refreshData: async () => { await loadTags(); loadData(clear); } }, fail: () => uni.showToast({ title: '目标页面暂不可用', icon: 'none' }) }); },
    delTable: () => remove(selectedItems()),
    confirmDelete: (id: string) => remove([id]),
    sortChange: (event: { order: string }, field: string) => { if (!/^[\w.]+$/.test(field)) return; orderby.value = event.order ? `${field} ${event.order === 'ascending' ? 'asc' : 'desc'}` : (kind === 'user' ? 'last_login_date desc' : 'create_date desc'); nextTick(() => loadData()); },
    filterChange: (event: { filterType: string; filter: any }, field: string) => { filters.value[field] = { type: event.filterType, value: event.filter }; smsCondition.value = { ...filters.value }; rebuildWhere(); },
  };
}

type Menu = { _id?: string; menu_id: string; name: string; parent_id?: string; url?: string; sort?: number; enable?: boolean; permission?: string[]; icon?: string; json?: string };

export function useAdminMenuList(pluginMenuJsons: Menu[]) {
  const { accessReady, checkAccess, getDatabase } = useAdminAccess();
  const proxy = getCurrentInstance()!.proxy as any;
  const menus = ref<Menu[]>([]);
  const loading = ref(false);
  const busy = ref(false);
  const errMsg = ref('');
  const currentTab = ref('menus');
  const selectedPluginMenuIndexs = ref<number[]>([]);
  const pluginMenusTableRef = ref<TableHandle | null>(null);
  const toggling = new Set<string>();
  const pluginMenus = computed(() => accessReady.value && proxy.$hasRole('admin') ? pluginMenuJsons.filter(menu => !menus.value.some(item => item.menu_id === menu.menu_id)) : []);
  const data = computed(() => {
    const result: Menu[] = [];
    const visited = new Set<string>();
    const sorted = [...menus.value].sort((a, b) => (a.sort || 0) - (b.sort || 0));
    const visit = (menu: Menu, depth: number) => {
      if (visited.has(menu.menu_id)) return;
      visited.add(menu.menu_id);
      result.push({ ...menu, name: (depth ? '　'.repeat(depth) + '|-' : '') + menu.name });
      sorted.filter(child => child.parent_id === menu.menu_id).forEach(child => visit(child, depth + 1));
    };
    sorted.filter(menu => !menu.parent_id).forEach(menu => visit(menu, 0));
    sorted.forEach(menu => visit(menu, 0));
    return result;
  });
  const loadData = async () => {
    if (!checkAccess()) return;
    if (loading.value) return;
    loading.value = true;
    errMsg.value = '';
    try {
      // 菜单需要完整树，分批读取，避免超过 JQL 单次上限导致子菜单遗漏。
      const all: Menu[] = [];
      for (let offset = 0; ; offset += 500) {
        const db = getDatabase();
        if (!db) return;
        const res = await db.collection('opendb-admin-menus').field('menu_id,name,parent_id,url,sort,enable,permission,icon').orderBy('_id asc').skip(offset).limit(500).get();
        const rows = res.data as Menu[];
        all.push(...rows);
        if (rows.length < 500) break;
      }
      if (!checkAccess()) return;
      menus.value = all;
      selectedPluginMenuIndexs.value = [];
      pluginMenusTableRef.value?.clearSelection();
      if (!pluginMenus.value.length) currentTab.value = 'menus';
    } catch (err) { errMsg.value = (err as Error).message || '加载菜单失败'; reportAdminError(err); }
    finally { loading.value = false; }
  };
  const enableChange = async (item: Menu) => {
    const db = getDatabase();
    if (!db) return;
    const id = item._id!;
    if (toggling.has(id)) return;
    toggling.add(id);
    try {
      await db.collection('opendb-admin-menus').doc(id).update({ enable: !item.enable });
      if (!checkAccess()) return;
      const original = menus.value.find(menu => menu._id === id);
      if (original) original.enable = !item.enable;
      uni.$emit('uni-admin-menus-changed');
    } catch (err) { reportAdminError(err); await loadData(); }
    finally { toggling.delete(id); }
  };
  const confirmDelete = (menu: Menu) => {
    if (!checkAccess()) return;
    if (busy.value || loading.value) return;
    const businessIds = new Set([menu.menu_id]);
    let size = 0;
    while (size !== businessIds.size) {
      size = businessIds.size;
      menus.value.forEach(item => { if (item.parent_id && businessIds.has(item.parent_id)) businessIds.add(item.menu_id); });
    }
    if (businessIds.has('system_menu') || businessIds.has('system_management')) return reportAdminError(new Error('不能删除系统菜单及其父菜单'));
    const ids = menus.value.filter(item => businessIds.has(item.menu_id)).map(item => item._id!);
    uni.showModal({ title: '提示', content: ids.length > 1 ? '是否删除该菜单及其子菜单？' : '是否删除该菜单？', success: async res => {
      if (!res.confirm || busy.value) return;
      const db = getDatabase();
      if (!db) return;
      busy.value = true;
      try {
        await db.collection('opendb-admin-menus').where(`_id in ${JSON.stringify(ids)}`).remove();
        await loadData();
        uni.$emit('uni-admin-menus-changed');
      } catch (err) { reportAdminError(err); } finally { busy.value = false; }
    } });
  };
  const addMenus = async (items: Menu[]) => {
    const db = getDatabase();
    if (!db) return;
    if (busy.value || loading.value) return;
    busy.value = true;
    uni.showLoading({ title: '更新中...', mask: true });
    try {
      const existing = new Set(menus.value.map(item => item.menu_id));
      const values: Row[] = [];
      items.forEach(item => {
        if (existing.has(item.menu_id)) return;
        existing.add(item.menu_id);
        const value: Row = { ...item, enable: item.enable !== false };
        delete value.json;
        delete value._id;
        delete value.create_date;
        values.push(value);
      });
      if (values.length) await db.collection('opendb-admin-menus').add(values);
      if (!checkAccess()) return;
      uni.showToast({ title: values.length ? `新增了${values.length}个菜单` : '菜单无变动', icon: 'none' });
      await loadData();
      uni.$emit('uni-admin-menus-changed');
    } catch (err) { reportAdminError(err); } finally { busy.value = false; uni.hideLoading(); }
  };
  onReady(loadData);
  return {
    accessReady,
    data, loading, errMsg, currentTab, pluginMenus, pluginMenusTableRef, enableChange, confirmDelete,
    switchTab: (tab: string) => { currentTab.value = tab; },
    navigateTo: (url: string, _clear = true) => { if (checkAccess()) uni.navigateTo({ url, events: { refreshData: loadData }, fail: () => uni.showToast({ title: '目标页面暂不可用', icon: 'none' }) }); },
    pluginMenuSelectChange: (event: { detail: { index: number[] } }) => { selectedPluginMenuIndexs.value = event.detail.index; },
    addPluginMenus: () => {
      const items = selectedPluginMenuIndexs.value.map(index => pluginMenus.value[index]).filter(Boolean);
      if (!items.length) return reportAdminError(new Error('请选择要添加的菜单'));
      uni.showModal({ title: '提示', content: '您确认要添加已选中的菜单吗？', success: res => { if (res.confirm) addMenus(items); } });
    },
    updateBuiltInMenu: () => { if (checkAccess()) uni.navigateTo({ url: '/pages/setup/index' }); },
  };
}
