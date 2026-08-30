targetScope = 'resourceGroup'

param webAppName string
param pipelinePrincipalId string

var contributorRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'b24988ac-6180-42a0-ab88-20f7382dd24c')
var websiteContributorRoleDefinitionId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'de139f84-1756-47ae-9be6-808fbbe84772')

resource webApp 'Microsoft.Web/sites@2026-07-15' existing = {
  name: webAppName
}

resource infrastructureContributorRole 'Microsoft.Authorization/roleAssignments@2026-07-01-preview' = {
  name: guid(resourceGroup().id, pipelinePrincipalId, contributorRoleDefinitionId)
  properties: {
    principalId: pipelinePrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: contributorRoleDefinitionId
  }
}

resource webAppDeploymentRole 'Microsoft.Authorization/roleAssignments@2026-07-01-preview' = {
  scope: webApp
  name: guid(webApp.id, pipelinePrincipalId, websiteContributorRoleDefinitionId)
  properties: {
    principalId: pipelinePrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: websiteContributorRoleDefinitionId
  }
}
