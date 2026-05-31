"use strict";

const db = uniCloud.database();

exports.main = async (event = {}) => {
  const session = event.session || {};
  if (!session.userId || !["teacher", "admin"].includes(session.role)) {
    return { ok: false, message: "Only teachers or administrators can save course materials." };
  }

  const payload = normalizePayload(event);
  if (!payload.courseOfferingId || !payload.title || !payload.fileUrl) {
    return { ok: false, message: "Course, title, and uploaded file are required." };
  }

  const offering = await findById("course_offerings", payload.courseOfferingId);
  if (!offering) {
    return { ok: false, message: "Course offering was not found." };
  }

  if (!(await canManageOffering(session, offering))) {
    return { ok: false, message: "You do not have permission to manage this course offering." };
  }
  const teacher = session.role === "teacher" ? await findByField("teachers", "user_id", session.userId) : null;
  const uploadDeadlineAt = Number(offering.material_upload_deadline_at || 0);
  if (session.role === "teacher" && uploadDeadlineAt && Date.now() > uploadDeadlineAt) {
    return { ok: false, message: "The material upload deadline for this course has passed." };
  }

  const now = Date.now();
  const materialData = {
    course_offering_id: payload.courseOfferingId,
    uploader_user_id: session.userId,
    teacher_id: teacher ? teacher._id : payload.teacherId,
    title: payload.title,
    file_url: payload.fileUrl,
    file_id: payload.fileId || payload.fileUrl,
    file_name: payload.fileName,
    file_size: payload.fileSize,
    file_type: payload.fileType,
    is_public_to_students: payload.isPublicToStudents,
    knowledge_document_id: payload.knowledgeDocumentId,
    available_at: payload.availableAt || now,
    updated_at: now,
  };

  let materialId = payload.materialId;
  let before = null;

  if (materialId) {
    before = await findById("course_materials", materialId);
    if (!before) {
      return { ok: false, message: "Course material was not found." };
    }
    if (session.role === "teacher" && !materialBelongsToTeacher(before, teacher, session.userId)) {
      return { ok: false, message: "Teachers can edit only their own course materials." };
    }
    if (session.role === "admin" && !payload.teacherId && before.teacher_id) {
      materialData.teacher_id = before.teacher_id;
    }
    const currentOffering = await findById("course_offerings", before.course_offering_id);
    if (!currentOffering || !(await canManageOffering(session, currentOffering))) {
      return { ok: false, message: "You do not have permission to edit this course material." };
    }
    await db.collection("course_materials").doc(materialId).update(materialData);
  } else {
    const result = await db.collection("course_materials").add({
      ...materialData,
      created_at: now,
    });
    materialId = result.id;
  }

  const saved = { ...before, ...materialData, _id: materialId, created_at: before ? before.created_at : now };
  await writeAudit(payload.materialId ? "course_material.update" : "course_material.create", session, materialId, before, saved);

  return {
    ok: true,
    data: {
      material: buildMaterialView(saved, offering),
    },
  };
};

function normalizePayload(event) {
  return {
    materialId: String(event.materialId || event._id || "").trim(),
    courseOfferingId: String(event.courseOfferingId || "").trim(),
    title: String(event.title || "").trim(),
    fileUrl: String(event.fileUrl || event.fileID || event.fileId || "").trim(),
    fileId: String(event.fileId || event.fileID || event.fileUrl || "").trim(),
    fileName: String(event.fileName || event.name || "").trim(),
    fileSize: Number(event.fileSize || event.size || 0),
    fileType: String(event.fileType || inferFileType(event.fileName || event.fileUrl || event.fileID || "")).trim(),
    isPublicToStudents: event.isPublicToStudents !== false,
    knowledgeDocumentId: String(event.knowledgeDocumentId || "").trim(),
    availableAt: Number(event.availableAt || 0),
    teacherId: String(event.teacherId || event.teacher_id || "").trim(),
  };
}

async function canManageOffering(session, offering) {
  if (session.role === "admin") {
    return true;
  }

  const teacher = await findByField("teachers", "user_id", session.userId);
  const teacherIds = Array.isArray(offering.teacher_ids)
    ? offering.teacher_ids.map((item) => String(item || "").trim())
    : [];
  if (teacher && teacherIds.includes(String(teacher._id || "").trim())) {
    return true;
  }
  return teacherIds.includes(String(session.userId || "").trim());
}

async function findById(collection, id) {
  try {
    const result = await db.collection(collection).doc(id).get();
    return result.data && result.data[0] ? result.data[0] : null;
  } catch (error) {
    console.warn(`[save-course-material] ${collection} lookup failed.`, error);
    return null;
  }
}

async function findByField(collection, field, value) {
  try {
    const result = await db.collection(collection).where({ [field]: value }).limit(1).get();
    return result.data && result.data[0] ? result.data[0] : null;
  } catch (error) {
    console.warn(`[save-course-material] ${collection} lookup failed.`, error);
    return null;
  }
}

function buildMaterialView(item, offering) {
  return {
    _id: item._id,
    courseOfferingId: item.course_offering_id || "",
    courseId: offering.course_id || "",
    teacherId: item.teacher_id || "",
    uploaderUserId: item.uploader_user_id || "",
    title: item.title || "",
    fileUrl: item.file_url || "",
    fileId: item.file_id || item.file_url || "",
    fileName: item.file_name || "",
    fileSize: Number(item.file_size || 0),
    fileType: item.file_type || "",
    isPublicToStudents: item.is_public_to_students === true,
    knowledgeDocumentId: item.knowledge_document_id || "",
    timelineAt: Number(item.available_at || item.updated_at || 0),
    createdAt: Number(item.created_at || 0),
    updatedAt: Number(item.updated_at || 0),
  };
}

function inferFileType(value) {
  const ext = String(value || "").split("?")[0].split(".").pop().toLowerCase();
  if (["pdf", "doc", "docx", "xls", "xlsx", "txt"].includes(ext)) return "document";
  if (["ppt", "pptx"].includes(ext)) return "slide";
  if (["mp4", "mov", "avi", "mkv"].includes(ext)) return "video";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  return "file";
}

function materialBelongsToTeacher(material, teacher, sessionUserId) {
  const teacherId = String(material.teacher_id || "").trim();
  const uploaderUserId = String(material.uploader_user_id || "").trim();
  return Boolean(
    (teacherId && teacher && teacherId === String(teacher._id || "").trim()) ||
    (uploaderUserId && uploaderUserId === String(sessionUserId || "").trim()),
  );
}

async function writeAudit(action, session, targetId, before, after) {
  try {
    await db.collection("audit_logs").add({
      action,
      actor_user_id: session.userId,
      target_collection: "course_materials",
      target_id: targetId,
      before,
      after,
      created_at: Date.now(),
    });
  } catch (error) {
    console.warn("[save-course-material] audit write skipped.", error);
  }
}
