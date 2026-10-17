import '@/uni_modules/uni-id-pages-x/common/account-route'
import App from './App.uvue'

import { createSSRApp } from 'vue'
import { createI18n } from 'vue-i18n'
import store from './store/index.js'
import messages from './i18n/index.js'
import { formatDate } from './uni_modules/uni-dateformat/components/uni-dateformat/date-format.js'

export function createApp() {
	const app = createSSRApp(App)
	app.use(store)
	app.use(createI18n({
		legacy: false,
		globalInjection: true,
		locale: uni.getLocale(),
		fallbackLocale: 'zh-Hans',
		messages
	}))
	app.config.globalProperties.$formatDate = formatDate
	app.config.globalProperties.$hasRole = (roles: string | string[]) => {
		const user = uniCloud.config ? uniCloud.getCurrentUserInfo() : null
		return !!user && user.tokenExpired > Date.now() &&
			(typeof roles === 'string' ? [roles] : roles).some(role => (user.role || []).includes(role))
	}
	return {
		app
	}
}
