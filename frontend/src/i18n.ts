import {notFound} from 'next/navigation';
import {getRequestConfig} from 'next-intl/server';

// สามารถนำเข้าจากโครงร่างที่ใช้ร่วมกัน
const locales = ['en'];

export default getRequestConfig(async ({requestLocale}) => {
  // โดยทั่วไปจะสอดคล้องกับส่วน `[locale]`
  let locale = await requestLocale;

  // ตรวจสอบให้แน่ใจว่าใช้ภาษาท้องถิ่นที่ถูกต้อง
  if (!locale || !locales.includes(locale as any)) {
    locale = 'en';
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});