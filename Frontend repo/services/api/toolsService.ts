import type { BankRates, OneRoofPropertyDetails, Application } from '../../types';
import { logger } from '../../utils/logger';
import { MOCK_INTEREST_RATES, MOCK_PROPERTY_DETAILS } from './mockData';

const mockApiCall = <T,>(data: T): Promise<T> => {
    return new Promise(resolve => setTimeout(() => resolve(data), 500));
}

export const toolsService = {
  getOneRoofDetails: (address: string) => mockApiCall(MOCK_PROPERTY_DETAILS),
  
  getCurrentInterestRates: () => mockApiCall(MOCK_INTEREST_RATES),

  submitComplianceCheck: async (application: Application) => {
      return new Promise<void>((resolve) => {
          setTimeout(() => {
              logger.log(`Compliance check started for application ${application.id}`);
              resolve();
          }, 1000);
      });
  },

  sendEmail: async (to: string, subject: string, body: string) => {
      return new Promise<{success: boolean, messageId: string}>((resolve) => {
          setTimeout(() => {
              logger.log(`Mock email sent to ${to}: ${subject}`);
              resolve({ success: true, messageId: `msg_${Date.now()}` });
          }, 800);
      });
  }
};
