import React, { useState, useEffect } from 'react';
import { crmService } from '../../services/api';
import type { Lead } from '../../types';
import { LeadStatus } from '../../types';
import { LEAD_STATUS_COLUMNS } from '../../constants';
import { Card } from '../common/Card';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';

const LeadCard: React.FC<{ lead: Lead }> = ({ lead }) => {
    const probability = lead.conversionProbability || 0;
    const getBarColor = (p: number) => {
        if (p > 0.7) return 'bg-green-500';
        if (p > 0.4) return 'bg-yellow-500';
        return 'bg-red-500';
    };

    return (
        <div className="p-3 mb-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow-sm">
            <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-sm">{lead.name}</p>
                <img src={lead.avatarUrl} alt={lead.name} className="h-6 w-6 rounded-full" />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{lead.email}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Loan: ${lead.estimatedLoanAmount.toLocaleString()}
            </p>
            <div className="mt-3">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Conversion Probability</span>
                    <span className={`text-xs font-bold ${getBarColor(probability).replace('bg-', 'text-')}`}>
                        {(probability * 100).toFixed(0)}%
                    </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-1.5">
                    <div className={`${getBarColor(probability)} h-1.5 rounded-full`} style={{ width: `${probability * 100}%` }}></div>
                </div>
            </div>
        </div>
    );
};

const LeadPipeline: React.FC = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    crmService.getLeads()
      .then(data => {
        setLeads(data);
        setIsLoading(false);
      });
  }, []);

  const getLeadsByStatus = (status: LeadStatus) => {
    return leads.filter(lead => lead.status === status);
  };

  return (
    <div>
       <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Lead Pipeline</h2>
          <p className="text-gray-500 dark:text-gray-400">Track leads from creation to close.</p>
        </div>
        <Button leftIcon="PlusCircle">Add Lead</Button>
      </div>
      
      {isLoading ? (
        <div className="flex justify-center items-center h-96">
          <Icon name="Loader" className="h-10 w-10 animate-spin text-primary-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5">
          {LEAD_STATUS_COLUMNS.map(status => (
            <div key={status} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h3 className="font-semibold mb-4 text-center text-gray-600 dark:text-gray-300">
                {status.toUpperCase()} ({getLeadsByStatus(status).length})
              </h3>
              <div className="h-[calc(100vh-20rem)] overflow-y-auto pr-2">
                {getLeadsByStatus(status).map(lead => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default LeadPipeline;

