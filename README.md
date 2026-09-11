# 🚀 AutoLab Official Admin Skills Kit

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg?style=flat-square)](manifest.json)
[![Scale](https://img.shields.io/badge/scale-20%20Seats%20%7C%20277%2B%20Profiles-success.svg?style=flat-square)](#)
[![Proxy](https://img.shields.io/badge/proxy-Webshare%20Static%20Residential-orange.svg?style=flat-square)](#)
[![Anti--Detect](https://img.shields.io/badge/browser-AdsPower%20Local%20API-purple.svg?style=flat-square)](#)
[![Security](https://img.shields.io/badge/security-Zero--Leak%20Secret%20Shield-green.svg?style=flat-square)](#)

> **Official AutoLab Production Skills & Knowledge Distribution Repository**  
> ชุดทักษะและคู่มือปฏิบัติการสำหรับ AI Coding Assistants (Google Antigravity, Claude Desktop, Cursor, Codex) เพื่อควบคุมและบริหารจัดการระบบ Multi-Account ขนาดใหญ่ (ทีมงาน 20 คน / 277+ เพจ / โพสต์ 60,000 คลิปต่อเดือน) ด้วย **AdsPower Anti-Detect Browser** และ **Webshare Static Residential Proxy**

---

## 🚀 การติดตั้งและเริ่มใช้งาน (Quick Start via AI)

สามารถส่งคำสั่งด้านล่างนี้ให้ AI Assistant (Google Antigravity, Cursor, Claude) ดำเนินการติดตั้งและตั้งค่าสภาพแวดล้อมให้โดยอัตโนมัติ:

```text
ช่วยติดตั้ง / อัปเดต AutoLab Admin Skills จากคลังนี้ให้หน่อย:
https://github.com/Qtpx0/autolab-admin-skills.git

ขั้นตอนสำหรับ AI:
1. ดึงโค้ดล่าสุดจากคลังต้นทางเข้ามาที่โปรเจกต์
2. รันคำสั่งติดตั้ง: node scripts/update-admin-skills.js --apply --project .
3. ตรวจสอบไฟล์ %APPDATA%\AutoLab\AdminSkills\credentials.json (ต้องไม่มี Secret หลุดลง Git)
4. ทดสอบการเชื่อมต่อด้วย: node .agents/skills/webshare-proxy/scripts/audit-proxy-pool.js
```

---

## 🔄 การซิงค์และอัปเดตระบบอัตโนมัติ (Autonomous Sync Protocol)

เมื่อรันคำสั่งติดตั้งข้างต้น สคริปต์จะทำการกำหนด Rule ประจำโปรเจกต์ (`.agents/rules/autolab_admin_skills_auto_sync.md`) ให้อัตโนมัติ เพื่อให้ AI คอยตรวจสอบความสดใหม่ของสคริปต์และ KI Patches จากคลังต้นทางก่อนเริ่มปฏิบัติงาน ช่วยให้ทุกเครื่องในทีมทำงานบนมาตรฐานและกฎความปลอดภัยล่าสุดเสมอ

---

## 📦 โครงสร้างและทักษะหลักในแพ็กเกจ (Core Skills)

### 1. 🌐 `adspower-browser` (AdsPower Local API Controller)
ระบบควบคุมเบราว์เซอร์ AdsPower อัตโนมัติความเร็วสูงผ่าน Local API:
* **AutoLab Golden Fingerprint Standard:** บังคับล็อก Windows 10/11 Desktop 100%, เปิด AudioContext Noise, ป้องกัน WebRTC หลุด, ซิงค์ Timezone/Geo อิงตาม Proxy IP
* **Mandatory Chromium Occlusion Flags:** ฉีด Launch Arguments 3 ตัว (`--disable-backgrounding-occluded-windows`, `--disable-background-timer-throttling`, `--disable-renderer-backgrounding`) ป้องกัน Chrome ดีเลย์เวลาพับจอ
* **Zero-Config Dynamic Port Resolver:** อ่านพอร์ตสดของ AdsPower จาก `cwd_global/source/local_api` ภายใน 0ms ไม่ต้องตั้งค่าพอร์ตเอง
* **1-Command Fleet Provisioning:** เสกกลุ่ม + สร้างโปรไฟล์เบราว์เซอร์ 15 จอ พร้อมผูก Proxy แบบ Round-Robin

### 2. 🛡️ `webshare-proxy` (Webshare REST API v2/v3 Controller)
ระบบบริหารจัดการ IP บ้านแท้ (Static Residential Proxy) ผ่าน Webshare Cloud API:
* **3-Layer Health & Meta Firewall Audit:** ตรวจสอบสุขภาพ Proxy ทั้งพูล 50–100 ตัวภายใน 5 วินาที (ยิง HTTPS Handshake สู่ `www.facebook.com:443`, ตรวจ Spamhaus ZEN / SpamCop / Barracuda, และแมปโปรไฟล์ใน AdsPower)
* **Automated Country Swap (3–5s):** สลับสัญชาติ Proxy เป็น US หรือเปลี่ยน IP ตัวเสียผ่าน Webshare v3 Replacement API อัตโนมัติใน 1 คลิก
* **Household Normalcy Model:** อัตราส่วนแชร์ IP ที่ปลอดภัยสูงสุด (1 IP ต่อ 2.5–3 โปรไฟล์) เหมือนบ้านคนปกติ

---

## ⚡ ตารางคำสั่งลัดยอดนิยม (Admin CLI Cheat Sheet)

| หน้าที่ | คำสั่งสำหรับรันใน Terminal | คำอธิบาย |
| :--- | :--- | :--- |
| 🩺 **ตรวจสุขภาพ Proxy ทั้งพูล** | `node .agents/skills/webshare-proxy/scripts/audit-proxy-pool.js` | เช็ค 50 IPs สู่ Meta Edge + Spamhaus ใน 5 วิ |
| 🚀 **เสกโปรไฟล์พนักงานใหม่** | `node .agents/skills/adspower-browser/scripts/provision-project.js <ชื่อกลุ่ม> [15]` | สร้างกลุ่ม + 15 จอ + ผูกพ็อกซี่ Round-Robin |
| 🇺🇸 **สลับ Proxy ไป USA** | `node .agents/skills/webshare-proxy/scripts/swap-proxy-country.js <ชื่อจอ> US` | เปลี่ยนเป็น IP อเมริกา สะอาดกริ๊บใน 3 วินาที |
| 🧹 **ล้างแคชเริ่มใหม่ (Clean-Slate)** | `node .agents/skills/adspower-browser/scripts/clean-slate-profile.js <ชื่อจอ>` | ล้างแคช/คุกกี้ สุ่มลายนิ้วมือใหม่ คง Token AutoLab |
| 🔄 **อัปเดตสกิลเป็นเวอร์ชันล่าสุด** | `node scripts/update-admin-skills.js` | ดึงโค้ดเวอร์ชันล่าสุดและผสาน KI Patches |

---

## 🛠️ ขั้นตอนการติดตั้งครั้งแรก (Initial Setup Guide)

### ขั้นที่ 1: ติดตั้งโฟลเดอร์สกิล
นำโฟลเดอร์ `.agents/` และ `scripts/` ไปวางไว้ที่ Root ของโปรเจกต์ที่คุณทำงาน

### ขั้นที่ 2: ตั้งค่า API Credentials (ทำครั้งเดียว)
เพื่อความปลอดภัยสูงสุด ระบบจะไม่เก็บ API Key ไว้ในโฟลเดอร์ Git แต่จะอ่านจาก AppData ของเครื่อง:

สร้างไฟล์: `%APPDATA%\AutoLab\AdminSkills\credentials.json`
```json
{
  "migrationVersion": 1,
  "adsPowerApiKey": "ใส่_API_Key_จาก_AdsPower_ที่นี่",
  "webshareApiToken": "ใส่_API_Token_จาก_Webshare_ที่นี่"
}
```
*(ดูตัวอย่างได้จากไฟล์ `credentials.example.json` ในคลังนี้)*

### ขั้นที่ 3: ตรวจสอบความพร้อม
เปิด Terminal แล้วรันคำสั่ง:
```bash
node .agents/skills/adspower-browser/scripts/test-admin-skill-kit.js
```
ระบบจะตรวจเช็คพอร์ต AdsPower, สัญญาณเน็ตเวิร์ก และความปลอดภัยของคีย์ให้ครบทุกข้อ

---

## 🔒 มาตรฐานความปลอดภัย (Zero-Leak Secret Shield)

* 🛡️ **No Hardcoded Secrets:** ห้ามใส่ API Key, รหัสผ่าน หรือ Token ลงในโค้ดหรือเอกสาร Markdown เด็ดขาด
* 🛡️ **Automated Audit Pipeline:** ระบบ Maintainer มีสคริปต์ `test-publish-admin-skills.js` คอยสแกนบล็อกความลับไม่ให้หลุดขึ้น Public Git 100%
* 🛡️ **Preserved Local Overrides:** โฟลเดอร์ `local/` และไฟล์ `local-overrides.md` จะไม่ถูกเขียนทับเมื่อมีการสั่งอัปเดตเวอร์ชันใหม่

---

## 📜 บันทึกการเปลี่ยนแปลง (Changelog Highlights)

* **v1.4.0 (2026-09-11):**
  * เพิ่ม `audit-proxy-pool.js`: ตรวจสุขภาพ Proxy 3 ชั้นสู่ Meta Firewall & Multi-DNSBL
  * เพิ่ม `provision-project.js`: เสกโปรไฟล์พนักงานยกชุด 15 จอ พร้อมเฉลี่ยพูล Round-Robin
  * เพิ่ม KI Patch: `2026-09-11-webshare-3layer-meta-firewall-and-dnsbl-health-audit.md`
* **v1.3.0 (2026-09-11):**
  * เพิ่ม Zero-Config Dynamic Port Resolver (อ่านพอร์ต AdsPower อัตโนมัติ 0ms)
* **v1.2.0 (2026-09-09):**
  * บรรจุมาตรฐาน AutoLab Golden Fingerprint Profile Creation
* **v1.1.0 (2026-09-03):**
  * บรรจุ Chromium Occlusion Flags สำหรับป้องกันเบราว์เซอร์พับจอ

---
*Maintained with ❤️ by AutoLab Architecture Team*
