import { state as account } from '@/uni_modules/uni-id-pages-x/store.uts';
export default {
  namespaced: true,
  state: {},
  mutations: {},
  actions: {
    getUserInfo({ commit }) {
      const db = uniCloud.databaseForJQL();
      return db
        .collection('uni-id-users')
        .where('_id==$cloudEnv_uid')
        .field('username,nickname,mobile,email,role,permission')
        .get()
        .then(({ data }) => {
          const [userInfo] = data;

          if (userInfo) account.userInfo = { ...account.userInfo, ...userInfo };

          return Promise.resolve(userInfo);
        });
    },
  },
};
