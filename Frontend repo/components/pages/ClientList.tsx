import React, { useState, useEffect, useMemo } from 'react';
import { crmService } from '../../services/api';
import type { Client, Advisor, Application } from '../../types';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import ClientDetail from './ClientDetail';
import LoanApplicationForm from './LoanApplicationForm';
import AddClientForm from './AddClientForm';

interface ClientListProps {
  initialClientId: string | null;
  clearInitialClientId: () => void;
  navigateToApplication?: (applicationId: string) => void;
}

const ClientList: React.FC<ClientListProps> = ({ initialClientId, clearInitialClientId, navigateToApplication }) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [clientForNewApplication, setClientForNewApplication] = useState<Client | null>(null);
  const [draftApplication, setDraftApplication] = useState<Application | null>(null);
  const [applicationsRefreshKey, setApplicationsRefreshKey] = useState(0);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      crmService.getClients(),
      crmService.getAdvisors()
    ]).then(([clientsData, advisorsData]) => {
      setClients(clientsData);
      setAdvisors(advisorsData);
    }).catch(error => {
      console.error("Failed to load client list data:", error);
    }).finally(() => {
      setIsLoading(false);
    });
  }, []);
  
  useEffect(() => {
    if (initialClientId && clients.length > 0) {
        const clientToShow = clients.find(c => c.id === initialClientId);
        if (clientToShow) {
            setSelectedClient(clientToShow);
        }
        clearInitialClientId();
    }
  }, [initialClientId, clients, clearInitialClientId]);

  const filteredClients = useMemo(() => {
    return clients.filter(client =>
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [clients, searchTerm]);
  
  const handleNewApplication = async (client: Client) => {
    try {
      const draft = await crmService.createDraftApplication(client.id, client.name);
      setDraftApplication(draft);
      setClientForNewApplication(client);
      setSelectedClient(null);
    } catch (error) {
      console.error("Failed to create draft application:", error);
      alert("Could not create a draft application. Please try again.");
    }
  };

if (showAddModal) {
  return <AddClientForm onBack={() => setShowAddModal(false)} onSuccess={(newClient) => {
    setClients([newClient, ...clients]);
    setShowAddModal(false);
  }} />;
}

if (clientForNewApplication && draftApplication) {
  return (
    <LoanApplicationForm 
      client={clientForNewApplication}
      draftApplication={draftApplication}
      onBack={() => {
        setSelectedClient(clientForNewApplication);
        setClientForNewApplication(null);
        setDraftApplication(null);
        setApplicationsRefreshKey(k => k + 1);
      }}
      onSuccess={() => {
        setSelectedClient(clientForNewApplication);
        setClientForNewApplication(null);
        setDraftApplication(null);
        setApplicationsRefreshKey(k => k + 1);
      }}
    />
  );
}

  if (selectedClient) {
    return (
      <ClientDetail
        client={selectedClient}
        advisors={advisors}
        applicationsRefreshKey={applicationsRefreshKey}
        onBack={() => setSelectedClient(null)}
        onNewApplicationClick={() => handleNewApplication(selectedClient)}
        onApplicationsUpdated={() => setApplicationsRefreshKey(k => k + 1)}
        onOpenApplication={navigateToApplication}
      />
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg">
      <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Clients</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage your client database.</p>
        </div>
        <div className="flex items-center space-x-2">
           <div className="relative">
             <Icon name="Search" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
             <input
               type="text"
               placeholder="Search clients..."
               value={searchTerm}
               onChange={e => setSearchTerm(e.target.value)}
               className="pl-9 pr-4 py-2 w-full text-sm bg-gray-100 dark:bg-gray-700 border border-transparent rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
           </div>
          <Button leftIcon="PlusCircle" onClick={() => setShowAddModal(true)}>Add Client</Button>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <Icon name="Loader" className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : (
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th scope="col" className="px-6 py-3">Name</th>
                <th scope="col" className="px-6 py-3">Contact</th>
                <th scope="col" className="px-6 py-3">Address</th>
                <th scope="col" className="px-6 py-3">Date Added</th>
                <th scope="col" className="px-6 py-3 text-center">Owner</th>
                <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => {
                const owner = advisors.find(a => a.id === client.advisorId);
                return (
                  <tr
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      <div className="flex items-center">
                          <img src={client.avatarUrl} alt={client.name} className="h-8 w-8 rounded-full mr-3" />
                          {client.name}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>{client.email}</div>
                      <div className="text-xs">{client.phone}</div>
                    </td>
                    <td className="px-6 py-4">{client.address}</td>
                    <td className="px-6 py-4">{client.dateAdded}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center">
                        {owner ? (
                            <img src={owner.avatarUrl} alt={owner.name} title={owner.name} className="h-8 w-8 rounded-full" />
                        ) : (
                            <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center" title="Unassigned">
                                <Icon name="UserCog" className="h-5 w-5 text-gray-400" />
                            </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedClient(client)}>View</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default ClientList;
