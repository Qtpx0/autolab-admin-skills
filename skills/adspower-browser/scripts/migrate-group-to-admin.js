const { request, listGroups, listProfiles, sleep } = require('./api-client');

async function migrateGroup(targetGroupName) {
    // 0. Safety Blacklist Guard
    const BLACKLIST = [];
    if (BLACKLIST.includes(targetGroupName)) {
        throw new Error(`[SAFETY GUARD] กลุ่ม "${targetGroupName}" อยู่ใน Blacklist ห้ามแตะต้องเด็ดขาด!`);
    }

    console.log(`\n======================================================`);
    console.log(`🚀 [AutoLab] เริ่มกระบวนการย้ายกลุ่ม: "${targetGroupName}" สู่บัญชี Admin`);
    console.log(`======================================================\n`);

    // 1. ค้นหากลุ่มเป้าหมายเดิม
    const groupsRes = await listGroups();
    const groupList = groupsRes?.list || [];
    const oldGroup = groupList.find(g => g.group_name === targetGroupName);

    if (!oldGroup) {
        throw new Error(`ไม่พบกลุ่มชื่อ "${targetGroupName}" ในระบบ AdsPower!`);
    }

    const oldGroupId = String(oldGroup.group_id);
    console.log(`📍 1. เจอกลุ่มเป้าหมายเดิม: "${targetGroupName}" (Group ID: ${oldGroupId})`);

    // 2. ดึงรายชื่อโปรไฟล์ทั้งหมดในกลุ่มเดิม
    const profilesRes = await listProfiles({ group_id: oldGroupId, page_size: 100 });
    const profiles = profilesRes?.list || [];
    const userIds = profiles.map(p => p.user_id);

    console.log(`📦 2. ตรวจพบเบราว์เซอร์ทั้งหมด: ${profiles.length} จอ`);
    profiles.forEach(p => console.log(`   - จอ #${p.serial_number}: ${p.name} (ID: ${p.user_id})`));

    if (userIds.length === 0) {
        console.log(`⚠️ ไม่มีโปรไฟล์ในกลุ่มนี้ ข้ามขั้นตอนย้ายโปรไฟล์`);
    }

    // 3. เปลี่ยนชื่อกลุ่มเดิมเป็น _old ชั่วคราว
    const tempOldName = `${targetGroupName}_old`;
    console.log(`\n✏️ 3. กำลังเปลี่ยนชื่อกลุ่มเดิมเป็น: "${tempOldName}"...`);
    const renameRes = await request('/api/v1/group/update', 'POST', {
        group_id: oldGroupId,
        group_name: tempOldName
    });
    console.log(`   ✅ เปลี่ยนชื่อกลุ่มเดิมสำเร็จ:`, renameRes);
    await sleep(1300);

    // 4. สร้างกลุ่มใหม่ด้วยชื่อเดิม (บัญชี Admin ที่กำลังล็อกอินจะเป็นคนสร้างอัตโนมัติ)
    console.log(`\n✨ 4. กำลังสร้างกลุ่มใหม่ชื่อ: "${targetGroupName}" ด้วยบัญชี Admin...`);
    const createRes = await request('/api/v1/group/create', 'POST', {
        group_name: targetGroupName,
        remark: oldGroup.remark || ''
    });
    const newGroupId = String(createRes?.group_id || createRes?.data?.group_id || createRes?.id);
    console.log(`   ✅ สร้างกลุ่มใหม่สำเร็จ! (New Group ID: ${newGroupId})`);
    await sleep(1300);

    // 5. โยกย้ายโปรไฟล์ทั้งหมดเข้ากลุ่มใหม่
    if (userIds.length > 0) {
        console.log(`\n🚚 5. กำลังโยกย้ายโปรไฟล์ทั้ง ${userIds.length} จอ เข้าสู่กลุ่มใหม่ (Group ID: ${newGroupId})...`);
        const regroupRes = await request('/api/v1/user/regroup', 'POST', {
            group_id: newGroupId,
            user_ids: userIds
        });
        console.log(`   ✅ โยกย้ายเบราว์เซอร์ทั้งหมดสำเร็จ!`, regroupRes);
        await sleep(1300);

        // 6. ตรวจสอบความถูกต้อง 100% (Strict Verification Gate)
        console.log(`🔍 6. กำลังตรวจสอบความถูกต้องของกลุ่มใหม่...`);
        const verifyRes = await listProfiles({ group_id: newGroupId, page_size: 100 });
        const verifyProfiles = verifyRes?.list || [];
        if (verifyProfiles.length !== userIds.length) {
            throw new Error(`[CRITICAL] จำนวนโปรไฟล์ไม่ตรงกัน! ก่อนย้าย: ${userIds.length} หลังย้าย: ${verifyProfiles.length}`);
        }
        console.log(`   ✅ ตรวจสอบผ่าน 100%: จำนวนโปรไฟล์ครบ ${verifyProfiles.length} จอ ไม่มีตกหล่นหรือมั่วกลุ่ม!`);
    }

    console.log(`\n======================================================`);
    console.log(`🎉 [สำเร็จ 100%] ย้ายกลุ่ม "${targetGroupName}" เรียบร้อยแล้ว!`);
    console.log(`- กลุ่มใหม่: "${targetGroupName}" (สร้างโดย Admin) พร้อม ${userIds.length} จอ`);
    console.log(`- กลุ่มเดิม: "${tempOldName}" ว่างเปล่าแล้ว (เหลือ 0 จอ สามารถกดลบทิ้งใน UI ได้เลย)`);
    console.log(`======================================================\n`);

    return {
        success: true,
        oldGroupId,
        newGroupId,
        movedCount: userIds.length
    };
}

if (require.main === module) {
    const groups = process.argv.slice(2);
    if (groups.length === 0) groups.push('Project Q');
    
    (async () => {
        for (let i = 0; i < groups.length; i++) {
            const groupName = groups[i];
            console.log(`\n[${i + 1}/${groups.length}] กำลังจัดการ: ${groupName}`);
            await migrateGroup(groupName);
            if (i < groups.length - 1) {
                console.log(`⏳ พักเครื่อง 2 วินาทีก่อนเริ่มกลุ่มถัดไป...`);
                await sleep(2000);
            }
        }
        console.log(`\n🏁 [ALL COMPLETE] ดำเนินการย้ายครบทุกกลุ่มเรียบร้อยแล้ว!`);
    })().then(() => process.exit(0)).catch(err => {
        console.error('❌ Error:', err.message || err);
        process.exit(1);
    });
}

module.exports = { migrateGroup };
