import { authService } from './authService';
import { clientService } from './clientService';
import { applicationService } from './applicationService';
import { taskService } from './taskService';
import { documentService } from './documentService';
import { noteService } from './noteService';
import { toolsService } from './toolsService';

// To prevent breaking changes during refactor, we re-export everything
// so existing components mapped to crmService still work until refactored.
export const crmService = {
    ...authService,
    ...clientService,
    ...applicationService,
    ...taskService,
    ...documentService,
    ...noteService,
    ...toolsService,

    // Backward Compatibility Wrapper Methods for Refactoring
    getOneRoofPropertyDetails: (address: string) => toolsService.getOneRoofDetails(address),
    getAllCallTranscripts: (clientId?: string) => noteService.getCallTranscripts(clientId),
    updateCallTranscript: async (id: string, updates: any) => { console.warn('Mock: updateCallTranscript', id, updates); },
    addCallTranscript: async (transcript: any) => { console.warn('Mock: addCallTranscript', transcript); },
    getTaskComments: async (taskId: string) => { return []; },
    addTaskComment: async (comment: any) => { console.warn('Mock: addTaskComment', comment); },
    updateTask: async (id: string, updates: any) => taskService.updateTask(id, updates),
    addTask: async (taskData: any) => taskService.createTask(taskData),
    createDraftApplication: async (clientId: string, _clientName: string) => applicationService.createApplication({ clientId }),
    saveLenderRecommendation: async (clientId: string, recommendation: any) => { console.warn('Mock: saveLenderRecommendation', clientId); },
    getApplicationById: async (id: string) => { const apps = await applicationService.getApplications(); return apps.find(a => a.id === id) || null; },
    saveApplicationDraft: async (id: string, updates: any) => applicationService.updateApplication(id, updates),
    submitApplication: async (id: string, _data: any) => applicationService.updateApplicationWorkflowStage(id, 'Application Submitted' as any),
    updateApplicationDetails: async (id: string, updates: any) => applicationService.updateApplication(id, updates),
    createNote: async (noteData: any) => noteService.createNote({
        content: noteData.content,
        clientId: noteData.clientId,
        applicationId: noteData.applicationId,
    }),
    updateNote: async (id: string, content: string) => noteService.updateNote(id, content),
    addNote: async (noteData: any) => noteService.addNote(noteData.content, noteData.clientId, noteData.applicationId),
    addDocument: async (clientId: string, file: File, category: string, folderId?: string) => documentService.addDocument(clientId, file, category, folderId),
    getAllDataForAI: async () => {
        const [leads, applications, tasks] = await Promise.all([
            clientService.getLeads(),
            applicationService.getApplications(),
            taskService.getTasks(),
        ]);
        return { leads, applications, tasks };
    },
};

// Named exports for helpers imported directly (not via crmService)
export { authService, clientService, applicationService, taskService, documentService, noteService, toolsService };
export { toSupabaseFirmId } from './clientService';
export const getCurrentFirm = () => authService.getCurrentFirm();
