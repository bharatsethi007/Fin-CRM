import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/crmService';
import type { Application } from '../../types';
import { ApplicationStatus } from '../../types';
import { APPLICATION_STATUS_COLUMNS } from '../../constants';
import { Card } from '../common/Card';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';

const ApplicationCard: React.FC<{ application: Application }> = ({ application }) => (
  <div className="p-3 mb-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm">
    <p className="font-semibold text-sm">{application.clientName}</p>
    <p className="text-xs text-gray-500 dark:text-gray-400">{application.lender}</p>
    <p className="text-sm font-bold text-gray-800 dark:text-gray-200 mt-1">
      ${application.loanAmount.toLocaleString()}
    </p>
    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
      Settlement: {application.estSettlementDate}
    </p>
  </div>
);

const ApplicationTracker: React.FC = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    crmService.getApplications()
      .then(data => {
        setApplications(data);
        setIsLoading(false);
      });
  }, []);

  const getApplicationsByStatus = (status: ApplicationStatus) => {
    return applications.filter(app => app.status === status);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Application Tracker</h2>
          <p className="text-gray-500 dark:text-gray-400">Monitor active applications from submission to settlement.</p>
        </div>
        <Button leftIcon="PlusCircle">Add Application</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-96">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {APPLICATION_STATUS_COLUMNS.map(status => (
            <div key={status} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h3 className="font-semibold mb-4 text-center text-gray-600 dark:text-gray-300">
                {status.toUpperCase()} ({getApplicationsByStatus(status).length})
              </h3>
              <div className="h-[calc(100vh-20rem)] overflow-y-auto pr-2">
                {getApplicationsByStatus(status).map(app => (
                  <ApplicationCard key={app.id} application={app} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApplicationTracker;