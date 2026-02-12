import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

function TestSupabase() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function fetchClients() {
      try {
        console.log('🔌 Connecting to Supabase...')
        
        const { data, error } = await supabase
          .from('clients')
          .select('*')
        
        if (error) throw error
        
        console.log('✅ Success! Clients:', data)
        setClients(data)
      } catch (error) {
        console.error('❌ Error:', error.message)
        setError(error.message)
      } finally {
        setLoading(false)
      }
    }

    fetchClients()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>⏳ Loading clients from Supabase...</h2>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '40px', backgroundColor: '#fee', color: '#c00' }}>
        <h2>❌ Error connecting to Supabase</h2>
        <p>{error}</p>
        <p style={{ fontSize: '14px', marginTop: '20px' }}>
          Check the browser console (F12) for more details.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '40px', fontFamily: 'Arial, sans-serif' }}>
      <h1>🎉 Connected to Supabase!</h1>
      <h2>📊 Clients from Database:</h2>
      
      {clients.length === 0 ? (
        <p>No clients found in database.</p>
      ) : (
        <div style={{ marginTop: '20px' }}>
          {clients.map(client => (
            <div 
              key={client.id} 
              style={{ 
                border: '1px solid #ddd', 
                padding: '20px', 
                marginBottom: '15px',
                borderRadius: '8px',
                backgroundColor: '#f9f9f9'
              }}
            >
              <h3 style={{ margin: '0 0 10px 0', color: '#333' }}>
                {client.first_name} {client.last_name}
              </h3>
              <p style={{ margin: '5px 0' }}>
                <strong>Email:</strong> {client.email}
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>Phone:</strong> {client.phone || 'N/A'}
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>City:</strong> {client.city || 'N/A'}
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>Credit Score:</strong> {client.credit_score || 'N/A'}
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>Annual Income:</strong> ${client.annual_income?.toLocaleString() || 'N/A'}
              </p>
              <p style={{ margin: '5px 0' }}>
                <strong>Status:</strong> <span style={{ 
                  padding: '3px 8px', 
                  backgroundColor: client.status === 'active' ? '#d4edda' : '#fff3cd',
                  borderRadius: '4px'
                }}>{client.status}</span>
              </p>
            </div>
          ))}
        </div>
      )}
      
      <p style={{ marginTop: '30px', color: '#666', fontSize: '14px' }}>
        Total clients: {clients.length}
      </p>
    </div>
  )
}

export default TestSupabase