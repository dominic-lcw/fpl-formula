targetScope = 'resourceGroup'

param location string
param resourceToken string
param githubRepository string
param githubEnvironment string
param tags object

var pipelineIdentityName = 'azpip${resourceToken}'

resource pipelineIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2025-05-31-preview' = {
  name: pipelineIdentityName
  location: location
  tags: tags
}

resource githubFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2025-05-31-preview' = {
  parent: pipelineIdentity
  name: 'github-production'
  properties: {
    audiences: [
      'api://AzureADTokenExchange'
    ]
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubRepository}:environment:${githubEnvironment}'
  }
}

output clientId string = pipelineIdentity.properties.clientId
output principalId string = pipelineIdentity.properties.principalId
