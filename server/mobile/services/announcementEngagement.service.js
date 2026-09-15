exports.getEngagement = async (...args) => (await import('../../services/announcementEngagementService.js')).getEngagement(...args);
exports.engageAnnouncement = async (...args) => (await import('../../services/announcementEngagementService.js')).engageAnnouncement(...args);
exports.getEngagements = async (...args) => (await import('../../services/announcementEngagementService.js')).getEngagements(...args);
