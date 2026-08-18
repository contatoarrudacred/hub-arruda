# Assinafy API Reference
Basics
------

The Assinafy API is RESTful and allows access to documents, users, workspaces and signers, using an access token or a permanent key.

REST API
--------

> Request Example

```
curl -X GET "https://api.assinafy.com.br/v1/some-end-point" \
  -H 'X-Api-Key: hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrg'
```


> Success Response Example

```
{
    "status": 200,
    "message": "",
    "data": {
        "attribute_1": "value 1",
        "attribute_2": "value 2",
    }
}
```


> Error Response example

```
{
    "status": 400,
    "message": "Some error message.",
    "data": []
}
```


As a RESTful API, HTTP verbs are used according to the request type.

*   GET to retrieve data;
*   POST to create;
*   PUT to update;
*   DELETE to remove.

### Content Type

The default request and response data format is JSON. The XML format is also supported.

### Status Code

Every response will return the status attribute. The value of 200 indicates the request was successful. Otherwise another HTTP code will indicate the result. The status attribute will reflect the status code in HTTP headers.

### Authentication

Most endpoints require authentication. There two options:

*   A fixed API key;
    
*   An access token.
    

Searching, Paginating and Sorting
---------------------------------

> Request

```
curl -X GET 'https://api.assinafy.com.br/v1/accounts/631606b068b6cd6709f448bc/documents?page=1&per-page=25&search=name' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrghAvmvk6'
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": [
        { "id": "1zus3byLD2qOWrghAvmvk6", "name 1" },
        { "id": "2zus3byLD2qOWrghAvmvk6", "name 2" }
    ]
}
```


### URL Parameters


|Parameter|Description                                                    |
|---------|---------------------------------------------------------------|
|search   |Search term.                                                   |
|page     |Page number.                                                   |
|per-page |Desired count of records per page. A maximum of 100 is allowed.|
|sort     |Sort order for results.Example.: ?sort=name, ?sort=-created_at |


### Response Headers


|Header                   |Description               |
|-------------------------|--------------------------|
|X-Pagination-Current-Page|Current returned page.    |
|X-Pagination-Total-Count |Total count of records.   |
|X-Pagination-Page-Count  |Count of pages.           |
|X-Pagination-Per-Page    |Count of records per page.|


Test and Production Environments
--------------------------------

During development stage, use the sandbox base URL:  
[https://app-staging.assinafy.com.br](https://app-staging.assinafy.com.br/)

When development is completed, use the production base URL:  
[https://api.assinafy.com.br/v1](https://api.assinafy.com.br/v1)

Errors
------

It is important do consider responses resulting in a error. That can occur, for example, when a field is sent with an invalid value.

> 400 Bad Request

```
{
    "status": 400,
    "message": "The 'email' attribute cannot be empty.",
    "data": []
}
```


### Error Codes

The error code is returned in the _status_ attribute.


|Code|Type                 |
|----|---------------------|
|400 |Bad Request          |
|401 |Unauthorized         |
|403 |Forbidden            |
|404 |Not Found            |
|429 |Too Many Requests    |
|500 |Internal Server Error|


Postman Collection
------------------

This a public Postman collection to explore Assinafy endpoints. Here is how to use it:

1.  Access the [Assinafy Postman collection](https://www.postman.com/devassinafy/dev-assinafy-s-workspace/collection/tqqxlsd/assinafy-api-collection).
    
2.  At the left, select the Assinafy Collection.
    
3.  At the right side, click on _fork_ button to make a copy of the collection into your own workspace.
    

Quick Start
-----------

These are steps to quickly start using the API. At the end of it you will be able to create a document and send signature invitation to signers.

Creating a User Account
-----------------------

During the development of your application, we recommend creating a user account in our sandbox environment. To do this, please go to [https://app-staging.assinafy.com.br](https://app-staging.assinafy.com.br/).

Once your application is complete, use your user account from the production environment ([https://app.assinafy.com.br](https://app.assinafy.com.br/)).

For integrations using an API key, it is advisable to create a separate user account. For instance, you can create a user account named _My App_. This practice enables us to configure the minimum access necessary for the integration.

Setting Up Credentials
----------------------

### API Key

To authenticate your application and gain access to Assinafy's API, you will need to generate an API key. Follow these steps to create your key:

1.  Log in to your Assinafy account and navigate to the "My Account" page.
2.  Select the "API" tab.
3.  Follow the on-screen instructions to generate your unique API key.

*   Assinafy app sandbox URL: [https://app-staging.assinafy.com.br](https://app-staging.assinafy.com.br/)
*   Assinafy app production URL: [https://app.assinafy.com.br](https://app.assinafy.com.br/)

### Workspace Account ID

To find the workspace account ID, go to the "My Account" page and look for the "Workspaces" tab.

Uploading a Document
--------------------

> Document Upload Request Using Curl

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/documents" \
  -H 'X-Api-Key: hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrg'\
  -F 'file=@/tmp/document.pdf'
```


> Document Upload Request Using PHP

```
<?php
// To install requirements:
// composer require guzzlehttp/guzzle

require 'vendor/autoload.php';

use GuzzleHttp\Client;

// Credentials
$workspace_account_id = 'YOUR_WORKSPACE_ACCOUNT_ID';
$api_key = 'YOUR_API_KEY';

$file_path = '/tmp/document.pdf';
$url = 'https://api.main.stage.assinafy.com.br/v1/accounts/' . $workspace_account_id . '/documents';

$client = new Client([
    'headers' => [
        'X-Api-Key' => $api_key,
    ]
]);

$response = $client->request('POST', $url, [
    'multipart' => [
        [
            'name' => 'file',
            'contents' => file_get_contents($file_path),
            'filename' => 'document.pdf'
        ]
    ]
]);

echo $response->getStatusCode() . "\n";
echo $response->getBody()->getContents() . "\n";
```


> Document Upload Request Using Python

```
# To install requirements:
# pip install requests

import requests

# Credentials
workspace_account_id = 'YOUR_WORKSPACE_ACCOUNT_ID'
api_key = 'YOUR_API_KEY'

file_path = '/tmp/document.pdf'
url = 'https://api-staging.assinafy.com.br/v1/accounts/' + workspace_account_id + '/documents'

with open(file_path, 'rb') as file:
    files = {'file': file}
    headers = {'X-Api-Key': api_key}
    response = requests.post(url, headers=headers, files=files)

print(response.status_code)
print(response.json())
```


> 200 OK - Document Upload Response

```
{
  "id": "615601fab04c0a3147bb1246",
  "name": "document.pdf",
  "status": "uploaded",
  "assignment": null,
  "artifacts": {
    "original": "https://api.assinafy.com.br/v1/documents/615601fab04c0a3147bb1246/download/original"
  },
  "pages": [
    {
      "id": "615601faf166d6d1d8e7dc30",
      "number": 1,
      "height": 2100,
      "width": 1275,
      "download_url": "https://api.assinafy.com.br/v1/documents/615601fab04c0a3147bb1246/pages/615601faf166d6d1d8e7dc30/download"
    }
  ],
  "created_at": 1633026554,
  "updated_at": 1633026554,
  "is_closed": false
}
```


Upload a document from a local file and save the resulted ID to be used later.

`POST /accounts/:account_id/documents`


|Parameter |Type  |Description              |
|----------|------|-------------------------|
|X-Api-Key |Header|The API key.             |
|account_id|URL   |The workspace account ID.|


Both _account\_id_ URL parameter and _X-APU-Key_ header parameter are obtained as shown in previous steps.

Please follow the examples here to create a document from an uploaded file.

You may find more information in the [document](#document) session.

Creating Signers
----------------

> Create Signer

```
curl "https://api.assinafy.com.br/v1/accounts/e2d6ee35c7741ca4006b9e1a/signers" \
  -H 'X-Api-Key: hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrg'\
  -H 'Content-Type: application/json' \
  -d '
{
  "full_name": "John Dove",
  "email": "[email protected]"
}
'
```


> 200 OK - Signer Creation Response

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "signer",
    "id": "62d6ee35c7741ca4006b9e11",
    "full_name": "John Signer",
    "email": "[email protected]"
  }
}
```


Create signers and save the resulted IDs to be used later.

`POST /accounts/:account_id/signers`

Find more information in the [signer](#signer) session.

Requesting Signatures
---------------------

> Curl Request - Invitation to Sign a Document

```
curl -X POST https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463/assignments
  -H 'X-Api-Key: f720572d7fecf7c16c8463f720572d7fecf7c16c8463f72' \
  -H 'Content-Type: application/json' \
  -d '
{
  "method": "virtual",
  "signerIds": [
    "615605f50e968054a5b7c9b8"
  ]
}'
```


Invite signers to sign a document using the _virtual_ method.

`POST /documents/:document_id/assignments`

### Parameters


|Parameter  |Type  |Description                             |
|-----------|------|----------------------------------------|
|X-Api-Key  |Header|The API Key.                            |
|document_id|URL   |The document ID from the upload request.|
|method     |Body  |Should be virtual.                      |
|signerIds[]|Body  |Array with of signers IDs.              |


The _virtual_ method will not require any input from the signer. To request signatures with input fields, the _collect_ method should be used. For further details on how to implement this method, please refer to the [assignment](#assignment) section.

Authentication
--------------

A authentication can be done through these methods:

*   API key in the header `X-Api-Key`:  
    `X-Api-Key: {api-key}`
    
*   Access token in the `Authorization` header:  
    `Authorization: Bearer {access-token}`
    
*   Access token as URL parameter:  
    `?access-token={access-token}`
    

The recommended way to authenticate is throgh an API key. You can create a key from the settings page, in the Assinafy app.

if however, you want to use an access token, it is obtained through the login process using user email and password. It is a JWT token and usually it expires in one hour.

Login
-----

> Request

```
curl -X POST https://api.assinafy.com.br/v1/login \
-H 'Content-Type: application/json' \
-d '{ "email": "[email protected]", "password": "password" }'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiIsImp0aSI6IjY0MDFkZjQ3NWNkYzgxLjc2MTkwODgxIn0.eyJpc3MiOiJBc3NpbmFmeSIsImF1ZCI6IkFzc2luYWZ5IiwianRpIjoiNjQwMWRmNDc1Y2RjODEuNzYxOTA4ODEiLCJpYXQiOjE2Nzc4NDQyOTUsImV4cCI6MTY3OTY1ODY5NSwic3ViIjoiYmdqYXplbzVyOXYybHE3bDM2ZHg0OG5wIiwibmFtZSI6IkZcdTAwZTFiaW8gQ3Jpc3RpYW5vIExvdmF0byBKci4iLCJlbWFpbCI6ImRpcmNlLm9saXZlaXJhQGdtYWlsLmNvbSJ9.sHpe608nPwb5gMUMn-REy7TOxq7mxTPpPwE-bak6hz4",
    "user": {
      "id": "bgjazeo5r9v2lq7l36dx48np",
      "name": "John Smith",
      "email": "[email protected]",
      "telephone": "17989206641",
      "government_id": "15774136604",
      "is_email_verified": false,
      "has_accepted_terms": true,
      "created_at": "2023-03-03T11:51:34Z",
      "to_be_deleted_at": null
    },
    "accounts": [
      {
        "id": "6401df46d6a6b0c692d9ec49",
        "name": "JS",
        "roles": [
          "owner"
        ],
        "is_delete_allowed": true,
        "created_at": "2023-03-03T11:51:34Z"
      }
    ]
  }
}
```


`POST /login`

Login and create an access token.

### Headers

*   `Content-Type: application/json`

### Body Parameters


|Parameter|Required|Description     |
|---------|--------|----------------|
|email    |true    |User's email.   |
|password |true    |User's password.|


> Request

```
curl -X POST https://api.assinafy.com.br/v1/authentication/social-login \
-H 'Content-Type: application/json' \
-d '{
    "provider": "google",
    "token": "yOTUvImV4cCI6MTY3OTY1ODY5NSwic3ViIjoiYmdqYXplbzVyOXYybHE3bDM2ZHg0",
    "has_accepted_terms": true
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiIsImp0aSI6IjY0MDFkZjQ3NWNkYzgxLjc2MTkwODgxIn0.eyJpc3MiOiJBc3NpbmFmeSIsImF1ZCI6IkFzc2luYWZ5IivianRpIjoiNjQwMWRmNDc1Y2RjODEuNzYxOTA4ODEiLCJpYXQiOjE2Nzc4NDQyOTUvImV4cCI6MTY3OTY1ODY5NSwic3ViIjoiYmdqYXplbzVyOXYybHE3bDM2ZHg0OG5wIiwibmFtZSI6IkZcdTAwZTFiaW8gQ3Jpc3RpYW5vIExvdmF0byBKci4iLCJlbWFpbCI6ImRpcmNlLm9saXZlaXJhQGdtYWlsLmNvbSJ9.sHpe608nPwb5gMUMn-REy7TOxq7mxTPpPwE-bak6hz4",
    "user": {
      "id": "bgjazeo5r9v2lq7l36dx48np",
      "name": "John Smith",
      "email": "[email protected]",
      "telephone": "17989206641",
      "government_id": "15774136604",
      "is_email_verified": false,
      "has_accepted_terms": true,
      "created_at": "2023-03-03T11:51:34Z",
      "to_be_deleted_at": null
    },
    "accounts": [
      {
        "id": "6401df46d6a6b0c692d9ec49",
        "name": "JS",
        "roles": [
          "owner"
        ],
        "is_delete_allowed": true,
        "created_at": "2023-03-03T11:51:34Z"
      }
    ]
  }
}
```


`POST /authentication/social-login`

Receive an access token or an ID token obtained throught a social login provider and return an Assinafy access token.

### Headers

*   `Content-Type: application/json`

### Body Parameters


|Parameter         |Required|Description                                                          |
|------------------|--------|---------------------------------------------------------------------|
|provider          |true    |The provider type.                                                   |
|token             |true    |The access token or ID token obtained from the social login provider.|
|has_accepted_terms|true    |Boolean value indicating if user has accepted terms. Example: true.  |


Currently, the only possible provider type is _google_.

Create API Key
--------------

> Request

```
curl -X POST https://api.assinafy.com.br/v1/users/api-keys \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer 62b3a62b3a62b3ac64d6c55c64d6c55c64d6c55' \
-d '
{
  "password": "password"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "api_key": "mIpe_zdJfKUpMK9Va3XuYgzPXMxz49fIaRCWXseVkpVAX608A9j3i_D67qU5qW3M"
  }
}
```


`POST /users/api-keys`

Generate an API key for the user. The generated API key should be used through the header X-Api-Key.

Important: when generating a new key, the previous one will be deleted.

### Headers

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters


|Parameter|Required|Description     |
|---------|--------|----------------|
|password |true    |User's password.|


Get API Key
-----------

> Request

```
curl -X GET https://api.assinafy.com.br/v1/users/api-keys \
-H 'Authorization: Bearer 62b3a62b3a62b3ac64d6c55c64d6c55c64d6c55'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "api_key": "************************************************************9Jdr"
  }
}
```


`GET /users/api-keys`

Retrieve a masked version of existing API key. For security reasons, your existing API key cannot be retrieved fully.

While an API key was not generated yet, a null value is returned.

### Header Parameters

*   `Authorization: Bearer {access_token}`

Delete API Key
--------------

> Request

```
curl -X DELETE https://api.assinafy.com.br/v1/users/api-keys \
-H 'Authorization: Bearer 62b3a62b3a62b3ac64d6c55c64d6c55c64d6c55'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`DELETE /users/api-keys`

Delete an existing API key.

### Headers

*   `Authorization: Bearer {access_token}`

Change Password
---------------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/authentication/change-password \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
-d '
{
  "email": "[email protected]",
  "password": "X3$_!456aTa",
  "new_password": "X3$_!456aT"
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "email": "[email protected]"
  }
}
```


`PUT /authentication/change-password`

Change user's password.

### Headers

*   `Authorization Bearer {access_token}`
*   `Content-Type application/json`

### Body Parameters


|Parameter   |Required|Description                |
|------------|--------|---------------------------|
|email       |true    |User's email.              |
|password    |true    |The current password.      |
|new_password|true    |The new password to be set.|


Request Password Reset
----------------------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/authentication/request-password-reset \
-H 'Content-Type: application/json' \
-d '{
  "email": "[email protected]"
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "email": "[email protected]"
  }
}
```


`PUT /authentication/request-password-reset`

Request a password reset. An email with instructions will be sent to the user to continue the process. This is request is typically used when the user forgot his password or when it was not set yet.

### Headers

*   `Content-Type` - `application/json`

### Request Body


|Parameter|Required|Description  |
|---------|--------|-------------|
|email    |true    |User's email.|


Reset Password
--------------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/authentication/reset-password \
-H 'Content-Type: application/json' \
-d '{
  "email": "[email protected]",
  "token": "b3ac64d6c55b3ac64d6c55b3ac64d6c55b3ac64d6c55",
  "new_password": "62b3ac64d6c55"
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "email": "[email protected]"
  }
}
```


`PUT /authentication/reset-password`

Reset the user's password using instructions received by email.

### Headers

*   `Content-Type` - `application/json`

### Body Parameters


|Parameter   |Required|Description                                 |
|------------|--------|--------------------------------------------|
|email       |true    |User's email.                               |
|token       |false   |Token received by email as an URL parameter.|
|new_password|true    |The new password to be set.                 |


Signer
------

Create
------

> Request

```
curl "https://api.assinafy.com.br/v1/accounts/e2d6ee35c7741ca4006b9e1a/signers" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
  -H 'Content-Type: application/json' \
  -d '
{
  "full_name": "John Dove",
  "email": "[email protected]",
  "whatsapp_phone_number": "+5548999990000"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "signer",
    "id": "62d6ee35c7741ca4006b9e11",
    "full_name": "John Signer",
    "email": "[email protected]",
    "whatsapp_phone_number": "5548999990000"
  }
}
```


`POST /accounts/:account_id/signers`

Create a signer.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description    |
|----------|--------|---------------|
|account_id|True    |The account ID.|


### Body Parameters



* Parameter: full_name
  * Required: true
  * Description: Signer full name.
* Parameter: email
  * Required: false
  * Description: Signer Email.
* Parameter: whatsapp_phone_number
  * Required: false
  * Description: Signer's WhatsApp phone number. Format: E.164 (e.g., +5548999990000).


List
----

> Request

```
curl "https://api.assinafy.com.br/v1/accounts/60f720577e30d2047d4f385f/signers" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": "60f720577e30d2047d4f385f",
      "full_name": "Joan Signer",
      "email": "[email protected]",
      "whatsapp_phone_number": "5548999990000"
    },
    {
      "id": "60f72057b865123687d56c3c",
      "full_name": "Mary Signer",
      "email": "[email protected]",
      "whatsapp_phone_number": null
    }
  ]
}
```


`GET /accounts/:account_id/signers`

List signers of the workspace.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                                 |
|----------|--------|--------------------------------------------|
|account_id|true    |The account ID.                             |
|search    |false   |Search term to filter by full_name or email.|


Get
---

> Request

```
curl -X GET "https://api.assinafy.com.br/v1/accounts/35c7741ca4006b9e11/signers/62d6ee35c7741ca4006b9e11" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "signer",
    "id": "62d6ee35c7741ca4006b9e11",
    "full_name": "John Signer",
    "email": "[email protected]",
    "whatsapp_phone_number": "5548999990000"
  }
}
```


`GET /accounts/:account_id/signers/:signer_id`

Retrieve a signer's information.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description    |
|----------|--------|---------------|
|account_id|True    |The account ID.|
|signer_id |true    |The signer ID. |


Update
------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/accounts/35c7741ca4006b9e11/signers/62d6ee35c7741ca4006b9e11" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
  -d '
{
  "full_name": "John Dove",
  "email": "[email protected]",
  "whatsapp_phone_number": "+5548999990000"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "signer",
    "id": "62d6ee35c7741ca4006b9e11",
    "full_name": "John Signer",
    "email": "[email protected]",
    "whatsapp_phone_number": "5548999990000"
  }
}
```


`PUT /accounts/:account_id/signers/:signer_id`

Update signer's account information.

Important: A signer can only be updated while the record is not associated to any active document.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description    |
|----------|--------|---------------|
|account_id|true    |The account ID.|
|signer_id |true    |The signer ID. |


### Body Parameters



* Parameter: full_name
  * Required: false
  * Description: Signer full name.
* Parameter: email
  * Required: false
  * Description: Signer Email.
* Parameter: whatsapp_phone_number
  * Required: false
  * Description: Signer's WhatsApp phone number. Format: E.164 (e.g., +5548999990000).


Delete
------

> Request

```
curl -X DELETE "https://api.assinafy.com.br/v1/accounts/5c7741ca4006b9e1/signers/62d6ee35c7741ca4006b9e11" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`DELETE /accounts/:account_id/signers/:signer_id`

Delete a signer.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description    |
|----------|--------|---------------|
|account_id|true    |The account ID.|
|signer_id |true    |The signer ID. |


Get Self
--------

> Request

```
curl -X GET 'https://api.assinafy.com.br/v1/signers/self?signer-access-code=9uAWyOXx9hgzCKdCuahkinwvg8tWJ2RC'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "signer",
    "id": "uahkinwvg8tWJ2RC",
    "full_name": "Signer Name",
    "email": "[email protected]",
    "whatsapp_phone_number": "5548999990000",
    "has_accepted_terms": false,
    "has_signature": false,
    "has_initial": false
  }
}
```


`GET /signers/self`

Allows a signer to obtain his/her own information.

**Headers**:

*   `Content-Type` - `application/json`

### Body Parameters


|Parameter         |Required|Description        |
|------------------|--------|-------------------|
|signer-access-code|true    |Signer access code.|


Accept Terms
------------

> Request

```
curl -X PUT 'https://api.assinafy.com.br/v1/signers/accept-terms' -d '
{
  "signer-access-code": "9uAWyOXx9hgzCKdCuahkinwvg8tWJ2RC-n6hhxyLS1QfMhqWSw-PnwQlSs2oPNea"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "full_name": "Signer Name",
    "email": "[email protected]",
    "has_accepted_terms": true
  }
}
```


`PUT /signers/accept-terms`

This endpoint allows a signer to accept terms of use.

**Alternative:** Terms can also be accepted via the [Confirm Signer Data](#confirm-signer-data) endpoint by including `has_accepted_terms: true` in the request body. This allows confirming data and accepting terms in a single API call.

**Headers**:

*   `Content-Type` - `application/json`

### Body Parameters


|Parameter         |Required|Description        |
|------------------|--------|-------------------|
|signer-access-code|true    |Signer access code.|


Verify Email
------------

> Request

```
curl -XPOST 'https://api.assinafy.com.br/v1/verify' -d '
{
  "verification-code": "123456",
  "signer-access-code": "9uAWyOXx9hgzCKdCuahkinwvg8tWJ2RC-n6hhxyLS1QfMhqWSw-PnwQlSs2oPNea"
}
'
```


> 200 OK

```
{
  "message": "Code verified successfully"
}
```


`POST /verify`

Verify the signer email that received a link to access a document.

### Header Parameters

*   `Content-Type` - `application/json`

### Body Parameters


|Parameter         |Required|Description        |
|------------------|--------|-------------------|
|signer-access-code|true    |Signer access code.|
|verification-code |true    |Verification code. |


Confirm Signer Data
-------------------

> Request

```
curl -X PUT 'https://api.assinafy.com.br/v1/documents/c57d51eaad68a7/signers/confirm-data?signer-access-code=9uAWyOXx9hgzCKdCuahkinwvg8tWJ2RC-n6hhxyLS1QfMhqWSw-PnwQlSs2oPNea' \
-H 'Content-Type: application/json' \
-d '
{
  "email": "[email protected]",
  "whatsapp_phone_number": "+5548999990000",
  "has_accepted_terms": true
}
'
```


> 200 OK

```
{}
```


`PUT /documents/:documentId/signers/confirm-data`

Confirm signer data for virtual assignments. This endpoint is required for virtual assignments using email verification method. Signers must confirm their data before they can sign the document.

**Important:**

*   Both `email` and `whatsapp_phone_number` are **required** fields in this request.
*   For virtual assignments with email verification, this endpoint must be called after email verification and before signing.
*   **Email validation:**
    *   If the signer already has an email, the provided email **must match** the existing email exactly.
    *   If the signer doesn't have an email, the provided email will be saved to the signer's record.
*   **WhatsApp phone number validation:**
    *   If the signer already has a WhatsApp phone number, the provided phone number **must match** the existing phone number exactly.
    *   If the signer doesn't have a phone number, the provided phone number will be saved to the signer's record.
*   Terms acceptance can be done in this same request by setting `has_accepted_terms` to `true`, allowing you to confirm data and accept terms in a single API call.

### Header Parameters

*   `Content-Type` - `application/json`

### URL Parameters


|Parameter         |Required|Description        |
|------------------|--------|-------------------|
|documentId        |true    |Document custom ID.|
|signer-access-code|true    |Signer access code.|


### Body Parameters



* Parameter: email
  * Required: true
  * Description: Signer's email address. Must match the existing email if already set, or will be saved if not set. Must be a valid email format.
* Parameter: whatsapp_phone_number
  * Required: true
  * Description: Signer's WhatsApp phone number. Must match the existing phone number if already set, or will be saved if not set. Format: E.164 (e.g., +5548999990000).
* Parameter: has_accepted_terms
  * Required: false
  * Description: Set to true to accept terms of use. This allows accepting terms and confirming data in a single request.


### Error Responses

**400 Bad Request** - If email is missing:

```
{
  "name": "Bad Request",
  "message": "Email is required.",
  "code": 0,
  "status": 400
}
```


**400 Bad Request** - If email is empty:

```
{
  "name": "Bad Request",
  "message": "Email cannot be empty.",
  "code": 0,
  "status": 400
}
```


**400 Bad Request** - If email format is invalid:

```
{
  "name": "Bad Request",
  "message": "Invalid email.",
  "code": 0,
  "status": 400
}
```


**400 Bad Request** - If email doesn't match existing email:

```
{
  "name": "Bad Request",
  "message": "The provided email does not match the signer's email.",
  "code": 0,
  "status": 400
}
```


**400 Bad Request** - If WhatsApp phone number is missing:

```
{
  "name": "Bad Request",
  "message": "WhatsApp phone number is required.",
  "code": 0,
  "status": 400
}
```


**400 Bad Request** - If WhatsApp phone number is empty:

```
{
  "name": "Bad Request",
  "message": "WhatsApp phone number cannot be empty.",
  "code": 0,
  "status": 400
}
```


**400 Bad Request** - If WhatsApp phone number doesn't match existing phone number:

```
{
  "name": "Bad Request",
  "message": "The provided phone number does not match the signer's phone number.",
  "code": 0,
  "status": 400
}
```


**400 Bad Request** - If attempting to sign without confirming data first:

```
{
  "name": "Bad Request",
  "message": "Signer data must be confirmed before signing.",
  "code": 0,
  "status": 400
}
```


Upload Signature
----------------

> Request

```
curl 'https://api.assinafy.com.br/v1/signature?signer-access-code=9uAWyOXx9hgzCKdCuea&type=signature' \
-H 'Content-Type: image/png' \
-d '{<Binary Here>}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`POST /signature?signer-access-code=:signer_access_code&type=:type`

Upload the signer's signature or intial image.

### Header Parameters

*   `Content-Type` - `image/{png|jpeg}`

### URL Parameters


|Parameter         |Default  |Required|Description                    |
|------------------|---------|--------|-------------------------------|
|signer-access-code|         |true    |The signer access code.        |
|type              |signature|        |Should be signature or initial.|


Download Signature
------------------

> Request

```
curl 'https://api.assinafy.com.br/v1/signature/signature?signer-access-code=9uAWyOXx9hgzCKdCuea
```


> 200 OK

```
Content-Type: image/png

[PNG binary]
```


`GET /signature/:type?signer-access-code=:signer_access_code`

Download the signer's signature or initial image.

### URL Parameters


|Parameter         |Required|Description                    |
|------------------|--------|-------------------------------|
|signer_access_code|true    |The signer access code.        |
|type              |true    |Should be signature or initial.|


Document
--------

This is the documents management service. The endpoints of this area allow us to create, list, download and delete documents.

### Document Status

A document will be in one of the following status:


|Status             |Deletable|Description                                            |
|-------------------|---------|-------------------------------------------------------|
|uploading          |no       |The document upload is in process.                     |
|uploaded           |no       |The document has been uploaded.                        |
|metadata_processing|no       |The initial processing is under way.                   |
|metadata_ready     |yes      |The initial processing has been completed.             |
|expired            |yes      |The signature deadline has been reached.               |
|certificating      |no       |The document has been signed and is being certificated.|
|certificated       |no       |The document is certificated.                          |
|rejected_by_signer |yes      |A signer declined signing the document.                |
|pending_signature  |yes      |The document is waiting for signatures.                |
|rejected_by_user   |yes      |The signature process was cancelled by a user.         |
|failed             |yes      |The document processing has failed.                    |


Statuses
--------

> Request

```
curl -X GET "https://api.assinafy.com.br/v1/documents/statuses" \
  -H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "code": "uploading",
      "deletable": false
    },
    {
      "code": "uploaded",
      "deletable": false
    },
    {
      "code": "metadata_processing",
      "deletable": false
    },
    {
      "code": "metadata_ready",
      "deletable": true
    },
    {
      "code": "certificating",
      "deletable": false
    }
  ]
}
```


`GET /documents/statuses`

Returns the list of supported document statuses and their properties (such as whether a document in that status can be deleted).

### Header Parameters

*   `Authorization: Bearer {access_token}`

List
----

> Request

```
curl "https://api.assinafy.com.br/v1/accounts/d199996981dbd199996981db/documents" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": "6981dbd199996981d",
      "account_id": "1a",
      "name": "my_document.pdf",
      "status": "metadata_ready",
      "assignment": {
        "id": "1",
        "sender_email": "[email protected]",
        "method": "virtual",
        "expires_at": null,
        "message": null,
        "signers": [
          {
            "id": "customid1",
            "full_name": "Signer 1",
            "email": "[email protected]",
            "has_accepted_terms": false
          },
          {
            "id": "customid2",
            "full_name": "Signer 2",
            "email": "[email protected]",
            "has_accepted_terms": false
          }
        ],
        "items": [
          {
            "id": "dbd199996981d",
            "page": {
              "id": "dbd199996981d",
              "number": 1,
              "height": 1,
              "width": 1,
              "download_url": "https://api.assinafy.com.br/v1/documents/doc1/pages/1a/download"
            },
            "signer": {
              "id": "dbd199996981d",
              "full_name": "Signer Name",
              "email": "[email protected]",
              "has_accepted_terms": false
            },
            "field": {
              "id": "dbd199996981d",
              "name": "Assinatura",
              "type": "virtual",
              "regex": null,
              "is_pre_defined": false,
              "is_active": true,
              "is_required": true,
              "is_standard": false,
              "is_read_only": false,
              "is_visible": true
            },
            "display_settings": "",
            "value": "",
            "completed": true
          }
        ],
        "summary": {
          "signer_count": 2,
          "completed_count": 1,
          "signers": [
            {
              "id": "dbd199996981d",
              "full_name": "Signer 1",
              "email": "[email protected]",
              "has_accepted_terms": false,
              "completed": true
            },
            {
              "id": "dbd199996981d",
              "full_name": "Signer 2",
              "email": "[email protected]",
              "has_accepted_terms": false,
              "completed": false
            }
          ]
        }
      },
      "artifacts": {
        "original": "https://api.assinafy.com.br/v1/documents/doc1/download/original",
        "thumbnail": "https://api.assinafy.com.br/v1/documents/doc1/thumbnail"
      },
      "pages": [
        {
          "id": "dbd199996981d",
          "number": 1,
          "height": 1,
          "width": 1,
          "download_url": "https://api.assinafy.com.br/v1/documents/doc1/pages/1a/download"
        }
      ],
      "created_at": "2023-07-21T13:43:17Z",
      "updated_at": "2023-07-21T13:43:17Z",
      "is_closed": false,
      "decline_reason": null,
      "declined_by": null
    },
  ]
}
```


`GET /accounts/:account_id/documents`

This endpoint will list documents of the workspace.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters



* Parameter: account_id
  * Required: true
  * Description: ID of the workspace account.
* Parameter: status
  * Required: false
  * Description: Status filter. Ex.: ?status=pending_signature.
* Parameter: method
  * Required: false
  * Description: Signature method filter. Ex.: ?method=virtual. Possible values: virtual or collect.
* Parameter: search
  * Required: false
  * Description: Search term that will be used for partial matching on the following attributes: document.name, signer.full_name and signer.email.
* Parameter: sort
  * Required: false
  * Description: Allows sorting by: name and updated_at.


### Document Status

These are the possible document status:


|Status             |Deletable|Description                                            |
|-------------------|---------|-------------------------------------------------------|
|uploading          |no       |The document upload is in process.                     |
|uploaded           |no       |The document has been uploaded.                        |
|metadata_processing|no       |The initial processing is under way.                   |
|metadata_ready     |yes      |The initial processing has been completed.             |
|expired            |yes      |The signature deadline has been reached.               |
|certificating      |no       |The document has been signed and is being certificated.|
|certificated       |no       |The document is certificated.                          |
|rejected_by_signer |yes      |A signer declined signing the document.                |
|pending_signature  |yes      |The document is waiting for signatures.                |
|rejected_by_user   |yes      |The signature process was cancelled by a user.         |
|failed             |yes      |The document processing has failed.                    |


Upload and Create
-----------------

> Request

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/documents" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'\
  -F 'file=@/tmp/document.pdf'
```


> 200 OK

```
{
  "id": "615601fab04c0a3147bb1246",
  "name": "document.pdf",
  "status": "uploaded",
  "assignment": null,
  "artifacts": {
    "original": "https://api.assinafy.com.br/v1/documents/615601fab04c0a3147bb1246/download/original"
  },
  "pages": [
    {
      "id": "615601faf166d6d1d8e7dc30",
      "number": 1,
      "height": 2100,
      "width": 1275,
      "download_url": "https://api.assinafy.com.br/v1/documents/615601fab04c0a3147bb1246/pages/615601faf166d6d1d8e7dc30/download"
    }
  ],
  "created_at": 1633026554,
  "updated_at": 1633026554,
  "is_closed": false
}
```


`POST /accounts/:account_id/documents`

Create a document from an uploaded file.

**Headers**:

*   `Content-Type` - `multipart/form-data`
*   `Authorization` - `Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description             |
|----------|--------|------------------------|
|account_id|True    |The ID of the workspace.|


### Limits

*   **Maximum file size**: 25MB

Create from Template
--------------------

> Request

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/35c7741ca4006b9e11/templates/60f720572d7fecf7c16c8463/documents" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
  -d '
    {
      "name": "sample-contract-one-page.pdf",
      "message": "Message to the signers",
      "editor_fields": [
        {
          "field_id": "fa8c14f3af99d2846d1789de4ba",
          "value": "Field value"
        }
      ],
      "signers": [
        {
          "role_id": "fa8c14f32d732271e071998246e",
          "email": "[email protected]",
          "name": "Srta. Betina Silvana Rangel"
        },
        {
          "role_id": "fa8c14f3964a362e3230f2283d1",
          "email": "[email protected]",
          "name": "George Aguiar Espinoza"
        }
      ],
      "expires_at": "2024-07-30T23:59:00Z"
    }
'
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": {
        "resource": "document",
        "id": "fa8c140c614c928f7e7efa086b2",
        "account_id": "1a",
        "template_id": "fa8c140b5ee344f8e48236ed284",
        "name": "sample-contract-one-page.pdf",
        "status": "uploaded",
        "assignment": {
            "id": "fa8c140ccd5781b079738d19e95",
            "sender_email": "[email protected]",
            "method": "virtual",
            "expires_at": "2024-07-30T23:59:00Z",
            "message": "669fc6accda22",
            "signers": [
                {
                    "id": "fa8c140cb49b79f940aab95fddd",
                    "full_name": "Suzana Stephany Cordeiro",
                    "email": "[email protected]",
                    "has_accepted_terms": false
                }
            ],
            "copy_receivers": [
                {
                    "id": "fa8c140cbce705c1a080346cb39",
                    "full_name": "Eric Flores Filho",
                    "email": "[email protected]",
                    "has_accepted_terms": false
                }
            ],
            "items": [
                {
                    "id": "fa8c140cd99a0b9dcb40e7ef29e",
                    "page": null,
                    "signer": {
                        "id": "fa8c140cb49b79f940aab95fddd",
                        "full_name": "Suzana Stephany Cordeiro",
                        "email": "[email protected]",
                        "has_accepted_terms": false
                    },
                    "field": {
                        "id": "field1",
                        "name": "signature",
                        "type": "virtual",
                        "regex": null,
                        "is_pre_defined": false,
                        "is_active": true,
                        "is_required": true,
                        "is_standard": false,
                        "is_read_only": false,
                        "is_visible": true
                    },
                    "display_settings": [],
                    "value": null,
                    "completed": false
                }
            ],
            "summary": {
                "signer_count": 1,
                "completed_count": 0,
                "signers": [
                    {
                        "id": "fa8c140cb49b79f940aab95fddd",
                        "full_name": "Suzana Stephany Cordeiro",
                        "email": "[email protected]",
                        "has_accepted_terms": false,
                        "completed": false
                    }
                ]
            },
            "signing_urls": [
            {
                "signer_id": "customid1",
                "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
            },
            {
                "signer_id": "customid2",
                "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
            }
            ]
        },
        "artifacts": {
            "original": "https://api.assinafy.com.br/v1/v1/documents/fa8c140c614c928f7e7efa086b2/download/original",
            "thumbnail": "https://api.assinafy.com.br/v1/v1/documents/fa8c140c614c928f7e7efa086b2/thumbnail"
        },
        "pages": [
            {
                "id": "fa8c140c9617a07be842995d4a1",
                "number": 1,
                "height": 2100,
                "width": 1275,
                "download_url": "https://api.assinafy.com.br/v1/v1/documents/fa8c140c614c928f7e7efa086b2/pages/fa8c140c9617a07be842995d4a1/download"
            }
        ],
        "created_at": "2024-07-23T15:05:17Z",
        "updated_at": "2024-07-23T15:05:17Z",
        "is_closed": false,
        "decline_reason": null,
        "declined_by": null
    }
}
```


`POST /accounts/{account_id}/templates/{template_id}/documents`

Create a document from a template.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description     |
|-----------|--------|----------------|
|account_id |True    |The account ID. |
|template_id|True    |The template ID.|


### Body Parameters



* Parameter: signers[]
  * Required: true
  * Description: A list of signers required to sign the document.
* Parameter: signers[].role_id
  * Required: true
  * Description: The template role ID associated with the signer.
* Parameter: signers[].email
  * Required: true
  * Description: The signer's email address.
* Parameter: signers[].name
  * Required: true
  * Description: The signer's full name.
* Parameter: editor_fields[]
  * Required: false
  * Description: A list of editor fields and values.
* Parameter: editor_fields[].field_id
  * Required: true
  * Description: The unique identifier of a field, matching the field_id provided in the template data.
* Parameter: editor_fields[].value
  * Required: true
  * Description: The value to assign to the corresponding field.
* Parameter: name
  * Required: false
  * Description: The title or name for the document being created. The default is the template name.
* Parameter: message
  * Required: false
  * Description: An optional message to be sent to signers.
* Parameter: expires_at
  * Required: false
  * Description: The expiration date for the assignment in ISO 8601 format. By default, there is no expiration.


Get
---

> Request

```
curl "https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463" \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "document",
    "id": "1016d5795af62e28c2161efcb7a6",
    "account_id": "d199996981dbd199996981db",
    "name": "3.pdf",
    "status": "rejected_by_signer",
    "assignment": {
      "id": "1016d5a650dcb1e056eddd367bbd",
      "sender_email": "[email protected]",
      "expiration": "2038-01-01",
      "signers": [
        {
          "id": "customid1",
          "full_name": "Signer 1",
          "email": "[email protected]"
        },
        {
          "id": "customid2",
          "full_name": "Signer 2",
          "email": "[email protected]"
        }
      ],
      "method": "virtual",
      "items": [],
      "summary": {
        "signer_count": 0,
        "completed_count": 0,
        "signers": []
      },
      "signing_urls": [
        {
          "signer_id": "customid1",
          "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
        },
        {
          "signer_id": "customid2",
          "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
        }
      ]
    },
    "download_url": "https://api.assinafy.com.br/v1/documents/3/download",
    "download_final_url": null,
    "pages": [],
    "is_closed": true,
    "signing_url": "http://app.assinafy.test/sign/doc1",
    "created_at": "2022-07-19 18:14:29",
    "updated_at": "2022-07-19 18:14:29"
  }
}
```


> 200 OK | Document declined by a signer

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "document",
    "id": "1016d5795af62e28c2161efcb7a6",
    "name": "2.pdf",
    "status": "rejected_by_signer",
    "assignment": {
      "id": "1016d5a650dcb1e056eddd367bbd",
      "sender_email": "[email protected]",
      "expiration": "2038-01-01",
      "signers": [
        {
          "id": "customid1",
          "full_name": "Signer 1",
          "email": "[email protected]"
        },
        {
          "id": "customid2",
          "full_name": "Signer 2",
          "email": "[email protected]"
        }
      ],
      "method": "virtual",
      "items": [],
      "summary": {
        "signer_count": 0,
        "completed_count": 0,
        "signers": []
      },
      "signing_urls": [
        {
          "signer_id": "customid1",
          "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
        },
        {
          "signer_id": "customid2",
          "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
        }
      ]
    },
    "artifacts": {
      "original": "https://api.assinafy.com.br/v1/documents/3/download/original",
      "certificated": "https://api.assinafy.com.br/v1/documents/3/download/certificated",
      "certificate-page": "https://api.assinafy.com.br/v1/documents/3/download/certificate-page",
      "bundle": "https://api.assinafy.com.br/v1/documents/3/download/bundle"
    },

    "pages": [],
    "created_at": "2022-07-19 17:53:37",
    "updated_at": "2022-07-19 17:53:37",
    "decline_reason": "I regretted.",
    "activities": [
      {
        "id": 1,
        "event": "signer_rejected_document",
        "message": "Signer 1 decline doc 2",
        "origin": "",
        "created_at": "2022-07-19 17:53:36"
      }
    ]
  }
}
```


`GET /documents/{document_id}`

Get the document data by its ID.

### Header Parameters

*   `Authorization: Bearer {access_token}`

**Important:** The attribute _declined\_reason_ in the result, is only available when the the access token is from the user who created the document.

Delete
------

> Request

```
curl -X DELETE "https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463" \
  -H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`DELETE /documents/:documentId`

Delete a document by its ID.

### Header Parameters

*   `Authorization: Bearer {access_token}`

Download
--------

> Request

```
curl "https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463/download/original" \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' 
```


> 200 OK

```
Content-Type: application/pdf

[PDF binary]
```


`GET /documents/:document_id/download/:artifact_name`

Download a document artifact.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Paramenters


|Name         |Required|Description                      |
|-------------|--------|---------------------------------|
|document_id  |True    |The document ID.                 |
|artifact_name|True    |The type of artifact to download.|


**Artifact types**: original, certificated, certificate-page, bundle.

Download Thumbnail
------------------

> Request

```
curl "https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463/thumbnail" \
    -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
Content-Type: image/jpeg

[JPEG binary]
```


`GET /documents/:document_id/thumbnail`

Download the document thumbnail.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description                                      |
|-----------|--------|-------------------------------------------------|
|document_id|True    |The ID of the document to retrieve the thumbnail.|


Download Page
-------------

> Request

```
curl "https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463/pages/60f7205883c2fc57d51e68a7/download" \
    -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
Content-Type: application/jpeg

[JPEG binary]
```


`GET /documents/{document_id}/pages/{page_id}/download`

Download a document page as JPEG content.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description                             |
|-----------|--------|----------------------------------------|
|document_id|True    |The ID of the document to be downloaded.|
|page_id    |True    |The ID of the page to be downloaded.    |


Verify
------

> Request

```
curl "https://api.assinafy.com.br/v1/documents/FE32EDDADE7CBDDCBB934E7402047450B0E59C02/verify"
```


> 200 OK | Verified

```
{
  "status": 200,
  "message": "",
  "data": {
    "hash": "FE32EDDADE7CBDDCBB934E7402047450B0E59C02",
    "id": "63ddb172402799bfc991d10d",
    "status": "certificated",
    "page_count": "1",
    "signer_count": "1",
    "completed_count": 1,
    "completed_at": "2023-01-27T19:27:44Z",
    "verified_at": "2023-01-27T19:27:46Z",
    "is_valid": true,
    "message": ""
  }
}
```


> 200 OK | Not Verified

```
{
  "status": 200,
  "message": "",
  "data": {
    "hash": "INVALIDHASHEXAMPLE",
    "id": null,
    "status": null,
    "page_count": null,
    "signer_count": null,
    "completed_count": null,
    "completed_at": null,
    "verified_at": "2023-01-27T19:30:15Z",
    "is_valid": false,
    "message": "Document not signed or not found."
  }
}
```


`GET /documents/:signature_hash/verify`

Verify a document through its signature hash.

### URL Parameters


|Parameter     |Required|Description                                              |
|--------------|--------|---------------------------------------------------------|
|signature_hash|True    |The signature hash. It can be found on a signed document.|


List Activities
---------------

> Request

```
curl "https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463/activities" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": 3,
      "event": "signer_rejected_document",
      "message": "Signer 1 decline doc 2",
      "origin": {
        "ip": "172.19.0.1",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36"
      },
      "created_at": "2022-07-19 19:28:16"
    },
    {
      "id": 1,
      "event": "signature_requested",
      "message": "Requested signature from Mrs. Nicole Bergstrom ([email protected]).",
      "origin": {
        "ip": "172.19.0.1",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36"
      },
      "created_at": "2022-07-19 19:28:14"
    }
  ]
}
```


`GET /documents/:documentId/activities`

List document activities.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description     |
|----------|--------|----------------|
|documentId|true    |The document ID.|


Public: Get Basic Info
----------------------

> Request

```
curl "https://api.assinafy.com.br/v1/public/documents/39adfe3r5a3a"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "document",
    "id": "doc1",
    "name": "1.pdf",
    "page_count": "1",
    "created_by": "John Smith"
  }
}
```


`GET /public/documents/{document_id}`

Get public information about a document by its ID. This endpoint does not require authentication and returns basic document details.

### URL Parameters


|Parameter  |Required|Description            |
|-----------|--------|-----------------------|
|document_id|True    |The ID of the document.|


Signer: Send Token
------------------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/public/documents/39adfe3r5a3a/send-token" \
  -H "Content-Type: application/json" \
  -d '
{
  "recipient": "[email protected]",
  "channel": "email"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "document": {
      "resource": "document",
      "id": "doc1",
      "name": "1.pdf",
      "page_count": "1",
      "created_by": "John Smith"
    },
    "channel": "email",
    "recipient": "[email protected]"
  }
}
```


`PUT /public/documents/{document_id}/send-token`

Send the 6-digit token to the specified email for signing the document. This endpoint does not require authentication and allows the token to be sent to a signer.

### Header Parameters

*   `Content-Type: application/json`

### URL Parameters


|Parameter  |Required|Description            |
|-----------|--------|-----------------------|
|document_id|True    |The ID of the document.|


### Body Params


|Parameter|Required|Description               |
|---------|--------|--------------------------|
|recipient|True    |Email of the signer.      |
|channel  |True    |Channel to send the token.|


Template
--------

This is the templates management service. The endpoints of this area allow us to create, list, download and delete templates.

### Template Status

A template will be in one of the following status:


|Status    |Description                           |
|----------|--------------------------------------|
|uploading |The template upload is being uploaded.|
|uploaded  |The template has been uploaded.       |
|processing|The template is being processed.      |
|ready     |The template is ready to use.         |
|failed    |The template processing has failed.   |


List
----

> Request

```
curl "https://api.assinafy.com.br/v1/accounts/{account_id}/templates" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": [
        {
            "id": "fa7f3e524f3a2cc00a5ea4325e2",
            "name": "sample-contract-one-page.pdf",
            "document_name": "sample-contract-one-page.pdf",
            "message": null,
            "status": "Ready",
            "pages": [
                {
                    "id": "fa7f3e528d77f2b3ed786df2ce0",
                    "number": 1,
                    "height": 2100,
                    "width": 1275,
                    "download_url": "https://api.assinafy.com.br/v1/accounts/1a/templates/fa7f3e524f3a2cc00a5ea4325e2/pages/fa7f3e528d77f2b3ed786df2ce0/download",
                    "fields": []
                }
            ],
            "roles": [
                {
                    "id": "fa7f3e525bfefc71df3701eac6f",
                    "name": "Editor",
                    "assignment_type": "Editor",
                    "created_at": "2024-07-19T15:23:03Z",
                    "updated_at": "2024-07-19T15:23:03Z"
                }
            ],
            "created_at": "2024-07-19T15:23:03Z",
            "updated_at": "2024-07-19T15:23:03Z"
        }
    ]
}
```


`GET /accounts/{account_id}/templates`

This endpoint will list templates of the workspace.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                                                             |
|----------|--------|------------------------------------------------------------------------|
|account_id|true    |ID of the workspace account.                                            |
|status    |false   |Status filter. Ex.: ?status=ready.                                      |
|search    |false   |Search term that will be used for partial matching on the template name.|
|sort      |false   |Allows sorting by: name and updated_at.                                 |


### Template Status

These are the possible template status:


|Status    |Description                           |
|----------|--------------------------------------|
|uploading |The template upload is being uploaded.|
|uploaded  |The template has been uploaded.       |
|processing|The template is being processed.      |
|ready     |The template is ready to use.         |
|failed    |The template processing has failed.   |


Create
------

> Request

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/templates" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'\
  -F 'file=@/tmp/template.pdf'
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": {
        "resource": "template",
        "id": "fa88b732db84d01427d4cdd1092",
        "name": "template.pdf",
        "document_name": "template.pdf",
        "message": null,
        "status": "Uploaded",
        "pages": [
            {
                "id": "fa88b733237a1625c176bc4f14d",
                "number": 1,
                "height": 2100,
                "width": 1275,
                "download_url": "https://api.assinafy.com.br/v1accounts/1a/templates/fa88b732db84d01427d4cdd1092/pages/fa88b733237a1625c176bc4f14d/download",
                "fields": []
            }
        ],
        "roles": [
            {
                "id": "fa88b732ec207105225abcb1d9b",
                "name": "Editor",
                "assignment_type": "Editor",
                "created_at": "2024-07-22T14:00:50Z",
                "updated_at": "2024-07-22T14:00:50Z"
            }
        ],
        "created_at": "2024-07-22T14:00:50Z",
        "updated_at": "2024-07-22T14:00:50Z"
    }
}
```


`POST /accounts/{account_id}/templates`

Create a template from an uploaded file.

### Header Parameters:

*   `Content-Type` - `multipart/form-data`
*   `Authorization` - `Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description    |
|----------|--------|---------------|
|account_id|True    |The account ID.|


Update
------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/accounts/35c7741ca4006b9e11/templates/60f720572d7fecf7c16c8463" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
  -d '
{
  "message": "Hello, please sign this document.",
  "document_name": "target-filename.pdf",
  "name": "Template Title"
}
'
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": {
        "resource": "template",
        "id": "fa88c870407cc599bbdfac85388",
        "name": "Template Title",
        "document_name": "target-filename.pdf",
        "message": "Hello, please sign this document.",
        "status": "Ready",
        "pages": [
            {
                "id": "fa88c8707dbcc7902314021ea5c",
                "number": 1,
                "height": 2100,
                "width": 1275,
                "download_url": "https://api.assinafy.com.br/v1/accounts/1a/templates/fa88c870407cc599bbdfac85388/pages/fa88c8707dbcc7902314021ea5c/download",
                "fields": []
            }
        ],
        "roles": [
            {
                "id": "fa88c8704d2ab1f42d604c7883b",
                "name": "Editor",
                "assignment_type": "Editor",
                "created_at": "2024-07-22T14:30:58Z",
                "updated_at": "2024-07-22T14:30:58Z"
            }
        ],
        "created_at": "2024-07-22T14:30:58Z",
        "updated_at": "2024-07-22T14:30:58Z"
    }
}
```


`PUT /accounts/{account_id}/templates/{template_id}`

Update template information.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description     |
|-----------|--------|----------------|
|account_id |True    |The account ID. |
|template_id|True    |The template ID.|


### Body Parameters



* Parameter: message
  * Required: false
  * Description: The default message to be used when creating a document from this template.
* Parameter: document_name
  * Required: false
  * Description: The name that is going to be used to when creating a document from this template.
* Parameter: name
  * Required: false
  * Description: The name of the template


Get
---

> Request

```
curl "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/templates/60f720572d7fecf7c16c8463" \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "template",
    "id": "fa88be779d076e5e14a017258cb",
    "name": "sample-contract-one-page.pdf",
    "document_name": "sample-contract-one-page.pdf",
    "message": null,
    "status": "Ready",
    "pages": [
      {
        "id": "190daca595d4993500e757e86d9",
        "number": 1,
        "height": 2100,
        "width": 1275,
        "download_url": "https://api.assinafy.com.br/v1/accounts/1a/templates/fa88be779d076e5e14a017258cb/pages/190daca595d4993500e757e86d9/download",
        "fields": []
      }
    ],
    "roles": [
      {
        "id": "fa88be77a9f889145ed8eda2e20",
        "name": "Editor",
        "assignment_type": "Editor",
        "created_at": "2024-07-22T14:13:32Z",
        "updated_at": "2024-07-22T14:13:32Z"
      }
    ],
    "created_at": "2024-07-22T14:13:32Z",
    "updated_at": "2024-07-22T14:13:32Z"
  }
}
```


`GET /accounts/{account_id}/templates/{template_id}`

Get the template data by its ID.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description     |
|-----------|--------|----------------|
|account_id |True    |The account ID. |
|template_id|True    |The template ID.|


Duplicate
---------

> Request

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/templates/60f720572d7fecf7c16c8463" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'\
  -d '{"name": "New Template Name"}'
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": {
        "resource": "template",
        "id": "fa88be779d076e5e14a017258cb",
        "name": "Copy of sample-contract-one-page.pdf",
        "document_name": "sample-contract-one-page.pdf",
        "message": null,
        "status": "Ready",
        "pages": [
            {
                "id": "190daca595d4993500e757e86d9",
                "number": 1,
                "height": 2100,
                "width": 1275,
                "download_url": "https://api.assinafy.com.br/v1/accounts/1a/templates/fa88be779d076e5e14a017258cb/pages/190daca595d4993500e757e86d9/download",
                "fields": []
            }
        ],
        "roles": [
            {
                "id": "fa88be77a9f889145ed8eda2e20",
                "name": "Editor",
                "assignment_type": "Editor",
                "created_at": "2024-07-22T14:13:32Z",
                "updated_at": "2024-07-22T14:13:32Z"
            }
        ],
        "created_at": "2024-07-22T14:13:32Z",
        "updated_at": "2024-07-22T14:13:32Z"
    }
}
```


`POST /accounts/{account_id}/templates/{template_id}/duplicate`

Duplicate an existing template.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description     |
|-----------|--------|----------------|
|account_id |True    |The account ID. |
|template_id|True    |The template ID.|


### Body Parameters



* Parameter: name
  * Required: false
  * Description: The name to be assigned to the new template. Default set to "Copy of {template_name}" if not provided.


Delete
------

> Request

```
curl -X DELETE "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/templates/60f720572d7fecf7c16c8463" \
  -H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`DELETE /accounts/{account_id}/templates/{template_id}`

Delete a template by its ID.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description     |
|-----------|--------|----------------|
|account_id |True    |The account ID. |
|template_id|True    |The template ID.|


Update Fields
-------------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/accounts/35c7741ca4006b9e11/templates/60f720572d7fecf7c16c8463/fields" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
  -d '
{
  "pages": [
    {
      "page_id": "fa8bf8644237effb5ede2a8d36f",
      "fields": [
        {
          "role_id": "fa8bf86472fd3271c94a5e2eabf",
          "field_id": "field_id",
          "label": "Field label",
          "display_settings": {
            "left": 387.646240234375,
            "top": 563.6224975585938,
            "width": 421,
            "height": 45.8599999999999,
            "fontFamily": "Arial",
            "fontSize": 22,
            "backgroundColor": "#D5EBFF"
          }
        }
      ]
    }
  ]
}
'
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": {
        "resource": "template",
        "id": "fa8bf8640421cc17819b7f3cfba",
        "name": "template.pdf",
        "document_name": "template.pdf",
        "message": null,
        "status": "Ready",
        "pages": [
            {
                "id": "fa8bf8644237effb5ede2a8d36f",
                "number": 1,
                "height": 2100,
                "width": 1275,
                "download_url": "https://api.assinafy.com.br/v1/accounts/1a/templates/fa8bf8640421cc17819b7f3cfba/pages/fa8bf8644237effb5ede2a8d36f/download",
                "fields": [
                    {
                        "id": "fa8bf904a3e36e8991d8ce5f20d",
                        "field_id": "field_id",
                        "role_id": "fa8bf86472fd3271c94a5e2eabf",
                        "label": "Field label",
                        "display_settings": {
                            "top": "563.62249755859",
                            "left": "387.64624023438",
                            "width": "421",
                            "height": "45.86",
                            "fontSize": "22",
                            "fontFamily": "Arial",
                            "backgroundColor": "#D5EBFF"
                        },
                        "created_at": "2024-07-23T14:18:02Z",
                        "updated_at": "2024-07-23T14:18:02Z"
                    }
                ]
            }
        ],
        "roles": [
            {
                "id": "fa8bf86410a74e1d600e88e37bb",
                "name": "Editor",
                "assignment_type": "Editor",
                "created_at": "2024-07-23T14:16:56Z",
                "updated_at": "2024-07-23T14:16:56Z"
            },
            {
                "id": "fa8bf86472fd3271c94a5e2eabf",
                "name": "Role1",
                "assignment_type": "Signer",
                "created_at": "2024-07-23T14:16:57Z",
                "updated_at": "2024-07-23T14:16:57Z"
            }
        ],
        "created_at": "2024-07-23T14:16:56Z",
        "updated_at": "2024-07-23T14:16:57Z"
    }
}
```


`PUT /accounts/{account_id}/templates/{template_id}/fields`

Update template information.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description     |
|-----------|--------|----------------|
|account_id |True    |The account ID. |
|template_id|True    |The template ID.|


### Body Parameters


|Parameter                        |Required|Description                            |
|---------------------------------|--------|---------------------------------------|
|pages                            |true    |List of template pages.                |
|pages[].page_id                  |true    |Template page ID.                      |
|pages[].fields                   |true    |List of fields in the template page.   |
|pages[].fields[].role_id         |true    |Role ID.                               |
|pages[].fields[].field_id        |true    |Field ID.                              |
|pages[].fields[].label           |true    |Field Label.                           |
|pages[].fields[].display_settings|true    |Field positioning and font information.|


Download Page
-------------

> Request

```
curl "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/templates/60f720572d7fecf7c16c8463/pages/60f7205883c2fc57d51e68a7/download" \
    -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
Content-Type: application/jpeg

[JPEG binary]
```


`GET /accounts/{account_id}/templates/{template_id}/pages/{page_id}/download`

Download a template page as JPEG content.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description                         |
|-----------|--------|------------------------------------|
|account_id |True    |The account ID.                     |
|template_id|True    |The template ID.                    |
|page_id    |True    |The ID of the page to be downloaded.|


Template Role
-------------

This is the template roles management service. The endpoints of this area allow us to create, update and delete template roles.

Template roles are used to assign fields to a specific role in a template.

### Template Role Assignment Types:

The roles can be of the following types:


|Assignment Type|Description                                                           |
|---------------|----------------------------------------------------------------------|
|Editor         |The role responsible for preparing the document.                      |
|Signer         |The role that is going to sign the document generated from a template.|
|CopyReceiver   |The role that is going to receive a copy of the certified document.   |


Create
------

> Request

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/templates/60f720572d7fecf7c16c8463/roles" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'\
  -d '
      {
        "name": "Role1",
        "assignment_type": "Signer"
      }
  '
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": {
        "resource": "template_role",
        "id": "fa8c09f3e709a8a1c82d69b1454",
        "name": "Role1",
        "assignment_type": "Signer",
        "created_at": "2024-07-23T14:47:38Z",
        "updated_at": "2024-07-23T14:47:38Z"
    }
}
```


`POST /accounts/{account_id}/templates/{template_id}/roles`

Create a template role.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description     |
|-----------|--------|----------------|
|account_id |True    |The account ID. |
|template_id|True    |The template ID.|


### Body Parameters


|Parameter      |Required|Description                               |
|---------------|--------|------------------------------------------|
|name           |true    |The name of the template role.            |
|assignment_type|true    |The assignment type for the template role.|


### Template Role Assignment Types:

The roles can be of the following types:


|Assignment Type|Description                                                           |
|---------------|----------------------------------------------------------------------|
|Editor         |The role responsible for preparing the document.                      |
|Signer         |The role that is going to sign the document generated from a template.|
|CopyReceiver   |The role that is going to receive a copy of the certified document.   |


Update
------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/templates/60f720572d7fecf7c16c8463/roles/fa8c09f3705abb7ed721b2cdb10" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'\
  -d '
      {
        "name": "Role2",
        "assignment_type": "Signer"
      }
  '
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": {
        "resource": "template_role",
        "id": "fa8c09f3e709a8a1c82d69b1454",
        "name": "Role2",
        "assignment_type": "Signer",
        "created_at": "2024-07-23T14:47:38Z",
        "updated_at": "2024-07-23T14:47:38Z"
    }
}
```


`POST /accounts/{account_id}/templates/{template_id}/roles/{role_id}`

Update a template role.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description          |
|-----------|--------|---------------------|
|account_id |True    |The account ID.      |
|template_id|True    |The template ID.     |
|role_id    |True    |The template role ID.|


### Body Parameters


|Parameter      |Required|Description                               |
|---------------|--------|------------------------------------------|
|name           |true    |The name of the template role.            |
|assignment_type|true    |The assignment type for the template role.|


### Template Role Assignment Types:

The roles can be of the following types:


|Assignment Type|Description                                                           |
|---------------|----------------------------------------------------------------------|
|Editor         |The role responsible for preparing the document.                      |
|Signer         |The role that is going to sign the document generated from a template.|
|CopyReceiver   |The role that is going to receive a copy of the certified document.   |


Delete
------

> Request

```
curl -X DELETE "https://api.assinafy.com.br/v1/accounts/615601fab04c0a31/templates/60f720572d7fecf7c16c8463/roles/fa8c09f3705abb7ed721b2cdb10" \
  -H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`DELETE /accounts/{account_id}/templates/{template_id}/roles/{role_id}`

Delete a template role by its ID.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter  |Required|Description          |
|-----------|--------|---------------------|
|account_id |True    |The account ID.      |
|template_id|True    |The template ID.     |
|role_id    |True    |The template role ID.|


List Assignment Types
---------------------

> Request

```
curl "https://api.assinafy.com.br/v1/template-role-assignment-types" \
  -H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg"
```


> 200 OK

```
{
    "status": 200,
    "message": "",
    "data": [
        {
            "code": "Editor",
            "name": "Editor"
        },
        {
            "code": "Signer",
            "name": "Signer"
        },
        {
            "code": "CopyReceiver",
            "name": "Copy receiver"
        }
    ]
}
```


`GET /template-role-assignment-types`

List template roles assignment types.

### Header Parameters

*   `Authorization: Bearer {access_token}`

Assignment
----------

An assignment represent a request for signees to sign a document.

Verification and Notification Methods
-------------------------------------

When creating assignments, you can configure how signers verify their identity and how they receive notifications.

> Email Verification with Email Notification (default)

```
{
  "id": "signer123",
  "verification_method": "Email"
  // notification_methods defaults to ["Email"]
}
```


> Bypass Verification with Bypass Notification (default)

```
{
  "id": "signer456",
  "verification_method": "Bypass"
  // notification_methods defaults to ["Bypass"]
}
```


> Bypass Verification with Email Notification (explicit)

```
{
  "id": "signer789",
  "verification_method": "Bypass",
  "notification_methods": ["Email"]
}
```


### Verification Methods

Verification methods determine how signers prove their identity before signing:



* Method: Email Verification
  * Code: Email
  * Description: Signers receive a verification code via email that must be entered before signing.
  * Requirements: Signer must have an email address.
* Method: Bypass Verification
  * Code: Bypass
  * Description: Signers can access the signing page directly without additional verification. Returns a direct signing URL with an access code.
  * Requirements: Requires the account to have the verification bypass feature enabled. Signers can be created without email, but email must be provided via /signers/verify-info before signing.


### Notification Methods

Notification methods determine how signers are notified about signature requests:



* Method: Email Notification
  * Code: Email
  * Description: Sends an email invitation to the signer with a link to sign the document.
  * Requirements: Signer must have an email address.
* Method: Bypass Notification
  * Code: Bypass
  * Description: No notification is sent. The signing URL must be shared manually.
  * Requirements: None.


### Default Behavior

If `notification_methods` is not specified for a signer:

*   Signers with `Email` verification default to `Email` notification.
*   Signers with `Bypass` verification default to `Bypass` notification.

Create without Input
--------------------

> Request

```
curl -X POST https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463/assignments \
-H 'Content-Type: application/json' \
-d '
{
  "signers": [
    {
      "id": "615605f50e968054a5b7c9b8",
      "verification_method": "Email",
      "notification_methods": ["Email"]
    },
    {
      "id": "615605f50e968054a5b7c9b9",
      "verification_method": "Bypass",
      "notification_methods": ["Bypass"]
    }
  ],
  "method": "virtual",
  "expiration": "2021-09-30"
}
'
```


> 200 OK

```
{
  "id": "615605f8f0cc742d680c62c5",
  "expiration": "2021-09-30",
  "signers": [
    {
      "id": "615605f50e968054a5b7c9b8",
      "full_name": "John Dove",
      "email": "[email protected]"
    },
    {
      "id": "615605f50e968054a5b7c9b9",
      "full_name": "Jane Doe",
      "email": "[email protected]"
    }
  ],
  "method": "virtual",
  "items": [
    {
      "id": "615605f8e4a097c44247bd8e",
      "page": null,
      "signer": {
        "id": "615605f50e968054a5b7c9b8",
        "full_name": "John Dove",
        "email": "[email protected]"
      },
      "field": {
        "id": "61521202f2f86152752c6a1b",
        "name": "Virtual",
        "type": "virtual"
      },
      "display_settings": [],
      "value": null,
      "completed": false
    }
  ],
  "signing_urls": [
    {
      "signer_id": "615605f50e968054a5b7c9b8",
      "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
    },
    {
      "signer_id": "615605f50e968054a5b7c9b9",
      "url": "https://api.assinafy.com.br/v1/sign/9uAWyOXx9hgzCKdCuahkinwvg8tWJ2RC-n6hhxyLS1QfMhqWSw-PnwQlSs2oPNea",
    }
  ]
}
```


`POST /documents/:documentId/assignments`

Create assignments without fields (method: 'virtual').

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters



* Parameter: method
  * Required: true
  * Description: Should be virtual.
* Parameter: signers[]
  * Required: true
  * Description: List of signers configuration.
* Parameter: signers[].id
  * Required: true
  * Description: Signer ID.
* Parameter: signers[].verification_method
  * Required: false
  * Description: Verification method code. See Verification Methods for available options. Defaults to Email.
* Parameter: signers[].notification_methods[]
  * Required: false
  * Description: List of notification method codes. See Notification Methods for available options. Defaults based on verification method.
* Parameter: message
  * Required: false
  * Description: Text to be included in the invitation email.
* Parameter: expires_at
  * Required: false
  * Description: Expiration date for the assignment in the ISO 8601 format. Default the default is no expiration.
* Parameter: copy_receivers
  * Required: false
  * Description: A list of signer IDs that should only receive a copy of the document.
* Parameter: signer_ids
  * Required: false
  * Description: (Legacy) A list of signer IDs. Defaults to Email verification and notification. Use signers instead.


Create with Input
-----------------

> Request

```
curl -X POST https://api.assinafy.com.br/v1/documents/60f720572d7fecf7c16c8463/assignments \
-H 'Content-Type: application/json' \
-d '
{
  "method": "collect",
  "signers": [
    {
      "id": "61521202f665dffcef5f6b24",
      "verification_method": "Email",
      "notification_methods": ["Email"]
    },
    {
      "id": "615212039529a822e24b6913",
      "verification_method": "Bypass",
      "notification_methods": ["Bypass"]
    }
  ],
  "entries": [
    {
      "page_id": "615213ed81b071f4293b2fc2",
      "fields": [
        {
          "signer_id": "61521202f665dffcef5f6b24",
          "field_id": "6152120297080d55bdd13197",
          "display_settings": {
            "left": 69,
            "top": 282,
            "fontFamily": "Arial",
            "fontSize": 18,
            "backgroundColor": "rgb(185, 218, 255)"
          }
        },
        {
          "signer_id": "615212039529a822e24b6913",
          "field_id": "6152120297080d55bdd13197",
          "display_settings": {
            "left": 639,
            "top": 285,
            "fontFamily": "Arial",
            "fontSize": 18,
            "backgroundColor": "rgb(195, 230, 203)"
          }
        }
      ]
    }
  ],
  "expires_at": "2021-09-30T21:00:00Z"
}
'
```


> 200 OK

```
{
  "id": "615606ef81d199996981dbce",
  "expiration": "2021-09-30",
  "signers": [
    {
      "id": "61521202f665dffcef5f6b24",
      "full_name": "Kennith Kuphal",
      "email": "[email protected]"
    },
    {
      "id": "615212039529a822e24b6913",
      "full_name": "Sonny Bayer",
      "email": "[email protected]"
    }
  ],
  "method": null,
  "items": [
    {
      "id": "615606efbb67641186c12330",
      "page": {
        "id": "615213ed81b071f4293b2fc2",
        "number": 1,
        "height": 2100,
        "width": 1275,
        "download_url": "https://api.assinafy.com.br/v1/documents/615213edf8a58f132e1b2384/pages/615213ed81b071f4293b2fc2/download"
      },
      "signer": {
        "id": "61521202f665dffcef5f6b24",
        "full_name": "Kennith Kuphal",
        "email": "[email protected]"
      },
      "field": {
        "id": "6152120297080d55bdd13197",
        "name": "Signature",
        "type": "signature"
      },
      "display_settings": {
        "top": 282,
        "left": 69,
        "fontSize": 18,
        "fontFamily": "Arial",
        "backgroundColor": "rgb(185, 218, 255)"
      },
      "value": null,
      "completed": false
    },
    {
      "id": "615606efcde1a39c9d21e30e",
      "page": {
        "id": "615213ed81b071f4293b2fc2",
        "number": 1,
        "height": 2100,
        "width": 1275,
        "download_url": "https://api.assinafy.com.br/v1/documents/615213edf8a58f132e1b2384/pages/615213ed81b071f4293b2fc2/download"
      },
      "signer": {
        "id": "615212039529a822e24b6913",
        "full_name": "Sonny Bayer",
        "email": "[email protected]"
      },
      "field": {
        "id": "6152120297080d55bdd13197",
        "name": "Signature",
        "type": "signature"
      },
      "display_settings": {
        "top": 285,
        "left": 639,
        "fontSize": 18,
        "fontFamily": "Arial",
        "backgroundColor": "rgb(195, 230, 203)"
      },
      "value": null,
      "completed": false
    }
  ],
  "signing_urls": [
    {
      "signer_id": "61521202f665dffcef5f6b24",
      "url": "https://api.assinafy.com.br/v1/sign/[email protected]"
    },
    {
      "signer_id": "615212039529a822e24b6913",
      "url": "https://api.assinafy.com.br/v1/sign/8vBXzPYy0ihzDLdDvbijlowxh9uXK3SD-o7iiyzMT2RgNirXTx-QoxRlTt3pQfb"
    }
  ]
}
```


`POST /documents/:documentId/assignments`

Create assignments with input fields.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters



* Parameter: method
  * Required: true
  * Description: Should be collect.
* Parameter: signers[]
  * Required: false
  * Description: List of signers configuration.
* Parameter: signers[].id
  * Required: true
  * Description: Signer ID. References a signer defined in the signers array.
* Parameter: signers[].verification_method
  * Required: false
  * Description: Verification method code. See Verification Methods for available options. Defaults to Email.
* Parameter: signers[].notification_methods[]
  * Required: false
  * Description: List of notification method codes. See Notification Methods for available options. Defaults based on verification method.
* Parameter: entries[]
  * Required: true
  * Description: List of assignment items.
* Parameter: entries[].page_id
  * Required: true
  * Description: Page ID.
* Parameter: entries[].fields
  * Required: true
  * Description: List of fields in the page.
* Parameter: entries[].fields[].signer_id
  * Required: true
  * Description: Signer ID. References a signer defined in the signers array.
* Parameter: entries[].fields[].field_id
  * Required: true
  * Description: Field ID.
* Parameter: entries[].fields[].display_settings
  * Required: true
  * Description: Field positioning and font information.
* Parameter: message
  * Required: false
  * Description: Text to be included in the invitation email.
* Parameter: expires_at
  * Required: false
  * Description: Expiration date for the assignment in the ISO 8601 format. Default the default is no expiration.
* Parameter: copy_receivers[]
  * Required: false
  * Description: A list of signer IDs that should only receive a copy of the document.


Resend
------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/documents/c57d51eaad68a7/assignments/d51edaee68a7/signers/a51edaee68a7/resend"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "is_sent": true,
    "document_id": "c57d51eaad68a7",
    "signer_id": "a51edaee68a7"
  }
}
```


`PUT /documents/:documentId/assignments/:assignmentId/signers/:signerId/resend`

Resend assignment input request message to a signer. This is used in case it is necessary to resend the email message with the link to sign a document.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter   |Required|Description       |
|------------|--------|------------------|
|documentId  |true    |The document ID.  |
|assignmentId|true    |The assignment ID.|
|signerId    |true    |The signer ID.    |


Reset Expiration
----------------

> Request example

```
curl -X PUT "https://api.assinafy.com.br/v1/documents/c57d51eaad68a7/assignments/d51edaee68a7/reset-expiration" -d
'{
  "expires_at": "2030-08-03T21:00:00Z"
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "assignment",
    "id": "1",
    "expires_at": "2030-08-03T21:00:00Z",
    "signers": [
      {
        "id": "customid1",
        "full_name": "Signer 1",
        "email": "[email protected]",
        "has_accepted_terms": false
      },
      {
        "id": "customid2",
        "full_name": "Signer 2",
        "email": "[email protected]",
        "has_accepted_terms": false
      }
    ],
    "method": "virtual",
    "items": [
      {
        "id": "1",
        "page": {
          "id": "1",
          "number": 1,
          "height": 1,
          "width": 1,
          "download_url": "https://api.assinafy.com.br/v1/documents/1/pages/1/download"
        },
        "signer": {
          "id": "customid1",
          "full_name": "Signer 1",
          "email": "[email protected]",
          "has_accepted_terms": false
        },
        "field": null,
        "display_settings": "",
        "value": "",
        "completed": true
      },
      {
        "id": "2",
        "page": {
          "id": "1",
          "number": 1,
          "height": 1,
          "width": 1,
          "download_url": "https://api.assinafy.com.br/v1/documents/1/pages/1/download"
        },
        "signer": {
          "id": "customid2",
          "full_name": "Signer 2",
          "email": "[email protected]",
          "has_accepted_terms": false
        },
        "field": null,
        "display_settings": "",
        "value": "",
        "completed": false
      },
      {
        "id": "3",
        "page": {
          "id": "1",
          "number": 1,
          "height": 1,
          "width": 1,
          "download_url": "https://api.assinafy.com.br/v1/documents/1/pages/1/download"
        },
        "signer": {
          "id": "customid1",
          "full_name": "Signer 1",
          "email": "[email protected]",
          "has_accepted_terms": false
        },
        "field": null,
        "display_settings": "",
        "value": "",
        "completed": true
      }
    ],
    "summary": {
      "signer_count": 2,
      "completed_count": 1,
      "signers": [
        {
          "id": "customid1",
          "full_name": "Signer 1",
          "email": "[email protected]",
          "has_accepted_terms": false,
          "completed": true
        },
        {
          "id": "customid2",
          "full_name": "Signer 2",
          "email": "[email protected]",
          "has_accepted_terms": false,
          "completed": false
        }
      ]
    }
  }
}
```


`PUT /documents/:documentId/assignments/:assignmentId/reset-expiration`

Reset assignment expiration. This endpoint can be used to set a new expiration date for an assignment. A null value is accepted and means no expiration date.

**Headers**:

*   `Content-Type` - `application/json`

### URL Parameters


|Parameter   |Required|Description       |
|------------|--------|------------------|
|documentId  |true    |The document ID.  |
|assignmentId|true    |The assignment ID.|


### Request Parameters



* Parameter: expires_at
  * Required: true
  * Description: The new date and time to be set in the ISO 8601 format. A null value means no expiration.


Get
---

> Request

```
curl 'https://api.assinafy.com.br/v1/sign?signer-access-code=9uAWyOXx9hgzCKdCuahkinwvg8tWJ2RC-n6hhxyLS1QfMhqWSw-PnwQlSs2oPNea'
```


> 200 OK

```
{
  "id": "615213edf8a58f132e1b2384",
  "account_id": "d199996981dbd199996981db",
  "name": "sample-contract-one-page.pdf",
  "status": "pending",
  "assignment": {
    "id": "615606ef81d199996981dbce",
    "expiration": "2021-09-30",
    "method": "collect",
    "items": [
      {
        "id": "615606efcde1a39c9d21e30e",
        "page": {
          "id": "615213ed81b071f4293b2fc2",
          "number": 1,
          "height": 2100,
          "width": 1275,
          "download_url": "https://api.assinafy.com.br/v1/documents/615213edf8a58f132e1b2384/pages/615213ed81b071f4293b2fc2/download"
        },
        "signer": {
          "id": "615212039529a822e24b6913",
          "full_name": "Sonny Bayer",
          "email": "[email protected]",
          "has_accepted_terms": true
        },
        "field": {
          "id": "6152120297080d55bdd13197",
          "name": "Signature",
          "type": "signature"
        },
        "display_settings": {
          "top": 285,
          "left": 639,
          "width": 501,
          "height": 27.340000000000032,
          "fontSize": 18,
          "fontFamily": "Arial",
          "backgroundColor": "rgb(195, 230, 203)"
        },
        "value": null,
        "completed": false
      }
    ],
    "summary": {
      "signer_count": 2,
      "completed_count": 1,
      "signers": [
        {
          "id": "customid1",
          "full_name": "Signer 1",
          "email": "[email protected]",
          "has_accepted_terms": true,
          "completed": true
        },
        {
          "id": "customid2",
          "full_name": "Signer 2",
          "email": "[email protected]",
          "has_accepted_terms": false,
          "completed": false
        }
      ]
    },
    "signing_urls": [
      {
        "signer_id": "customid1",
        "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
      },
      {
        "signer_id": "customid2",
        "url": "https://api.assinafy.com.br/v1/sign/[email protected]",
      }
    ]
  },
   "artifacts": {
    "original": "https://api.assinafy.com.br/v1/documents/3/download/original",
    "certificated": "https://api.assinafy.com.br/v1/documents/3/download/certificated",
    "certificate-page": "https://api.assinafy.com.br/v1/documents/3/download/certificate-page",
    "bundle": "https://api.assinafy.com.br/v1/documents/3/download/bundle"
  },
  "pages": [
    {
      "id": "615213ed81b071f4293b2fc2",
      "number": 1,
      "height": 2100,
      "width": 1275,
      "download_url": "https://api.assinafy.com.br/v1/documents/615213edf8a58f132e1b2384/pages/615213ed81b071f4293b2fc2/download"
    }
  ],
  "created_at": 1632769005,
  "updated_at": 1632769005,
  "current_signer": {
    "id": "615212039529a822e24b6913",
    "full_name": "Till Man",
    "email": "[email protected]",
    "has_accepted_terms": true,
    "verification_method": "Email",
    "notification_methods": ["Email"]
  }
}
```


`GET /sign`

Retrieve document assignment details as a signer. It requires the signer access code with verification code.

The response is the document data that the signer have access to.

### Header Parameters

*   `Content-Type` - `application/json`

### Request Parameters


|Parameter         |Default|Required|Description                                     |
|------------------|-------|--------|------------------------------------------------|
|signer-access-code|       |true    |Signer access code.                             |
|has_accepted_terms|false  |false   |Indicates whether signer has accepted the terms.|


Sign
----

> Request

```
curl -X POST 'https://api.assinafy.com.br/v1/documents/c57d51eaad68a7/assignments/d51edaee68a7?signer-access-code=9uAWyOXx9hgzCKdCuahkinwvg8tWJ2RC-n6hhxyLS1QfMhqWSw-PnwQlSs2oPNea' -d '
[
  {
    "itemId": "615606efcde1a39c9d21e30e",
    "fieldId": "6152120297080d55bdd13197",
    "pageId": "615213ed81b071f4293b2fc2",
    "value": "Signed by Sonny Bayer"
  }
]
'
```


`POST /documents/:documentId/assignments/:assignmentId`

Allow a signer to sign a document with input fields (collect method).

**Important:** For virtual assignments using email verification method, signers must confirm their data via `PUT /documents/:documentId/signers/confirm-data` before signing. Attempting to sign without confirming data will result in a 400 error: "Signer data must be confirmed before signing."

**Headers**:

*   `Content-Type` - `application/json`

### URL Parameters


|Parameter         |Required|Description                                  |
|------------------|--------|---------------------------------------------|
|signer-access-code|true    |Signer access code as query string parameter.|


### Body Parameters


|Parameter |Required|Description                        |
|----------|--------|-----------------------------------|
|[].itemId |true    |The item id.                       |
|[].fieldId|true    |Field it associated to the item.   |
|[].pageId |true    |The page id.                       |
|[].value  |true    |String representation of the value.|


### Error Responses

**400 Bad Request** - If attempting to sign without confirming data (for virtual assignments):

```
{
  "name": "Bad Request",
  "message": "Signer data must be confirmed before signing.",
  "code": 0,
  "status": 400
}
```


Decline
-------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/documents/c57d51eaad68a7/assignments/d51edaee68a7/reject?signer-access-code=1e7d51e68a7" \
-H 'Content-Type: application/json' \
-d '{
  "decline_reason": "I do not agree with clause 2."
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`PUT /documents/:documentId/assignments/:assignmentId/reject?signer-access-code=:accessCode`

Allows a signer to decline an assignment.

### Header Parameters

*   `Content-Type: application/json`

### URL Parameters


|Parameter   |Required|Description        |
|------------|--------|-------------------|
|documentId  |true    |The document ID.   |
|assignmentId|true    |The assignment ID. |
|accessCode  |true    |Signer access code.|


### Body Parameters


|Parameter     |Required|Description                                     |
|--------------|--------|------------------------------------------------|
|decline_reason|true    |Descriptive reason for declining the invitation.|


Signer Documents
----------------

List
----

> Request

```
curl -X GET https://api.assinafy.com.br/v1/signers/62d6ee35c7741ca4006b9e11/documents?signer-access-code=1ca4006b9e111ca4006b9e11
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": "6981dbd199996981d",
      "account_id": "1a",
      "name": "my_document.pdf",
      "status": "metadata_ready",
      "assignment": {
        "id": "1",
        "sender_email": "[email protected]",
        "method": "virtual",
        "expires_at": null,
        "message": null,
        "signers": [
          {
            "id": "customid1",
            "full_name": "Signer 1",
            "email": "[email protected]",
            "has_accepted_terms": false
          },
          {
            "id": "customid2",
            "full_name": "Signer 2",
            "email": "[email protected]",
            "has_accepted_terms": false
          }
        ],
        "items": [
          {
            "id": "dbd199996981d",
            "page": {
              "id": "dbd199996981d",
              "number": 1,
              "height": 1,
              "width": 1,
              "download_url": "https://api.assinafy.com.br/v1/documents/doc1/pages/1a/download"
            },
            "signer": {
              "id": "dbd199996981d",
              "full_name": "Signer Name",
              "email": "[email protected]",
              "has_accepted_terms": false
            },
            "field": {
              "id": "dbd199996981d",
              "name": "Assinatura",
              "type": "virtual",
              "regex": null,
              "is_pre_defined": false,
              "is_active": true,
              "is_required": true,
              "is_standard": false,
              "is_read_only": false,
              "is_visible": true
            },
            "display_settings": "",
            "value": "",
            "completed": true
          }
        ],
        "summary": {
          "signer_count": 2,
          "completed_count": 1,
          "signers": [
            {
              "id": "dbd199996981d",
              "full_name": "Signer 1",
              "email": "[email protected]",
              "has_accepted_terms": false,
              "completed": true
            },
            {
              "id": "dbd199996981d",
              "full_name": "Signer 2",
              "email": "[email protected]",
              "has_accepted_terms": false,
              "completed": false
            }
          ]
        }
      },
      "artifacts": {
        "original": "https://api.assinafy.com.br/v1/documents/doc1/download/original",
        "thumbnail": "https://api.assinafy.com.br/v1/documents/doc1/thumbnail"
      },
      "pages": [
        {
          "id": "dbd199996981d",
          "number": 1,
          "height": 1,
          "width": 1,
          "download_url": "https://api.assinafy.com.br/v1/documents/doc1/pages/1a/download"
        }
      ],
      "created_at": "2023-07-21T13:43:17Z",
      "updated_at": "2023-07-21T13:43:17Z",
      "is_closed": false,
      "decline_reason": null,
      "declined_by": null
    },
  ]
}
```


`GET /signers/:signer_id/documents?signer-access-code=1ca4006b9e111ca4006b9e11`

List signer's documents.

### Authorization

Either the `authorization` header or the `signer_access_code` URL parameter can be used for authorization.

### URL Parameters



* Parameter: signer_id
  * Required: true
  * Description: The signer ID.
* Parameter: signer_access_code
  * Required: true
  * Description: The signer access code.
* Parameter: status
  * Required: false
  * Description: Status code to filter results. Ex.: pending_signature.
* Parameter: method
  * Required: false
  * Description: Signature method filter. Ex.: ?method=virtual. Possible values: virtual or collect.
* Parameter: search
  * Required: false
  * Description: Search term that will be used for partial matching on the following attributes: document.name, signer.full_name and signer.email.
* Parameter: sort
  * Required: false
  * Description: Allows sorting by: name and updated_at.


When present, the `search` URL parameter will be used for a partial search on the following attributes: `document.name`, `signer.full_name` and `signer.email`.

Possible sort attributes are `name` and `updated_at`.

### Document Status

These are the possible document status:


|Status             |Deletable|Description                                            |
|-------------------|---------|-------------------------------------------------------|
|uploading          |no       |The document upload is in process.                     |
|uploaded           |no       |The document has been uploaded.                        |
|metadata_processing|no       |The initial processing is under way.                   |
|metadata_ready     |yes      |The initial processing has been completed.             |
|expired            |yes      |The signature deadline has been reached.               |
|certificating      |no       |The document has been signed and is being certificated.|
|certificated       |no       |The document is certificated.                          |
|rejected_by_signer |yes      |A signer declined signing the document.                |
|pending_signature  |yes      |The document is waiting for signatures.                |
|rejected_by_user   |yes      |The signature process was cancelled by a user.         |
|failed             |yes      |The document processing has failed.                    |


Sign Multiple
-------------

> Request

```
curl -X PUT 'https://api.assinafy.com.br/v1/signers/documents/sign-multiple?signer-access-code=9uAWyOXx9hgzCKhkinwvg8tWJ2RC' \
-d '{
  "document_ids": ["documentid1", "documentid2"]
}'
```


`PUT /signers/documents/sign-multiple`

> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


Allow a signer to sign multiple documents at once.

**Headers**:

*   `Content-Type` - `application/json`

### URL Parameters


|Parameter         |Required|Description                                  |
|------------------|--------|---------------------------------------------|
|signer-access-code|true    |Signer access code as query string parameter.|


### Body Parameters


|Parameter   |Required|Description                        |
|------------|--------|-----------------------------------|
|document_ids|true    |Array of document IDs to be signed.|


Decline Multiple
----------------

> Request

```
curl -X PUT 'https://api.assinafy.com.br/v1/signers/documents/decline-multiple?signer-access-code=9uAWyOXx9hgzCKhkinwvg8tWJ2RC' \
-d '{
  "document_ids": ["documentid1", "documentid2"],
  "decline_reason": "Unfavorable terms."
}'
```


`PUT /signers/documents/decline-multiple`

> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


Allow a signer to decline multiple documents at once.

**Headers**:

*   `Content-Type` - `application/json`

### URL Parameters


|Parameter         |Required|Description                                  |
|------------------|--------|---------------------------------------------|
|signer-access-code|true    |Signer access code as query string parameter.|


### Body Parameters


|Parameter     |Required|Description                                |
|--------------|--------|-------------------------------------------|
|document_ids  |true    |Array of document IDs to be declined.      |
|decline_reason|true    |Text explaining the reason for the decline.|


Download
--------

> Request

```
curl -X GET "https://api.assinafy.com.br/v1/signers/62d6ee35c7741ca4006b9e11/documents/62d6ee35c7741ca4006b9e11/download/original?signer-access-code=1ca4006b9e111ca4006b9e11"
```


> 200 OK

```
Content-Type: application/pdf

[PDF binary]
```


`GET /signers/:signer_id/documents/:document_id/download/:artifact_name?signer-access-code=1ca4006b9e111ca4006b9e11`

Download a signer's document.

### URL Parameters


|Parameter         |Required|Description                      |
|------------------|--------|---------------------------------|
|signer_id         |true    |The signer ID.                   |
|document_id       |true    |The document ID.                 |
|artifact_name     |True    |The type of artifact to download.|
|signer-access-code|True    |The signer's access code.        |


**Artifact types**: original, certificated, certificate-page, bundle.

Field Definition
----------------

Create
------

> Request

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/2120297080d55bdd13197/fields" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
  -H 'Content-Type: application/json' \
  -d '{ "type: "text", "name": "Field Name" }'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "field_definition",
    "id": "63cfe15556a99a147bdd304b",
    "name": "CPF",
    "type": "cpf",
    "regex": null,
    "is_active": true,
    "is_required": true,
    "is_standard": false,
    "is_read_only": false,
    "is_visible": true
  }
}
```


`POST /accounts/:accountId/fields`

Create a field definition.

**Headers**:

*   `Content-Type` - `application/json`
*   `Authorization` - `Bearer {access_token}`

### Body Parameters



* Parameter: type
  * Required: true
  * Default: 
  * Description: The input type.
* Parameter: name
  * Required: true
  * Default: 
  * Description: The label for the input field.
* Parameter: regex
  * Required: false
  * Default: 
  * Description: REGEX pattern to be used for validation. Ex.: "/[0-9]{2}-[0-9]{4}/". It is effective only for text input types.
* Parameter: is_required
  * Required: false
  * Default: true
  * Description: Indicate if an input value is required.
* Parameter: is_active
  * Required: false
  * Default: true
  * Description: Indicate if the field definition is active.


**Note:** the _/input-types_ endpoint can be used to list allowed types.

List
----

> Request

```
curl "https://api.assinafy.com.br/v1/accounts/2120297080d55bdd13197/fields" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": "64a7584106d7e3ded274da11",
      "name": "Name",
      "type": "personName",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a758410c5a5df8d07256b5",
      "name": "CPF",
      "type": "cpf",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a75841255d055eba653c6b",
      "name": "Phone Number",
      "type": "phoneNumber",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a758412201552421d7f60d",
      "name": "Postal Code",
      "type": "postalCode",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a75841ce1def29916e3d23",
      "name": "E-mail",
      "type": "email",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a758411a3fbc679ef91a55",
      "name": "CNPJ",
      "type": "cnpj",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a75841851209fc930db912",
      "name": "Company Name",
      "type": "companyName",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a75841090c4807361996b4",
      "name": "Text Field",
      "type": "text",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a758413ac706942c065035",
      "name": "Number",
      "type": "number",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    },
    {
      "id": "64a7584139987d891d5820df",
      "name": "Date",
      "type": "date",
      "regex": null,
      "is_pre_defined": true,
      "is_active": true,
      "is_required": false,
      "is_standard": false,
      "is_read_only": false,
      "is_visible": true
    }
  ]
}
```


`GET /accounts/:accountId/fields`

List field definitions.

**Headers**:

*   `Content-Type` - `application/json`
*   `Authorization` - `Bearer {access_token}`

###### URL Parameters



* Parameter: include_inactive
  * Default: false
  * Description: Indicate if inactive records should be returned. Possible values: true, false.
* Parameter: include_standard
  * Default: false
  * Description: Indicate if standard fields types should be returned. Possible values: true, false.


When indicating standard fields to be returned, records of type _signature_, _initial_ and _signatureDate_ will also be in the result.

Get
---

> Request

```
curl "https://api.assinafy.com.br/v1/accounts/2120297080d55bdd13197/fields/7080d55bdd13197" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "field_definition",
    "id": "63cfe123880b1ba571a97916",
    "name": "Field Name",
    "type": "text",
    "regex": null,
    "is_active": true,
    "is_required": true,
    "is_standard": false,
    "is_read_only": false,
    "is_visible": true
  }
}
```


`GET /accounts/:accountId/fields/{field_id}`

Get single field definition.

**Headers**:

*   `Content-Type` - `application/json`
*   `Authorization` - `Bearer {access_token}`

Update
------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/accounts/2120297080d55bdd13197/fields/63345ba3255f24a5bc7c75f0" \
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
  -H 'Content-Type: application/json' \
  -d '{ "name": "New Field Name" }'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "resource": "field_definition",
    "id": "63cfe0e0fdc4e3aeb74783d7",
    "name": "New Field Name",
    "type": "text",
    "regex": null,
    "is_active": true,
    "is_required": true,
    "is_standard": false,
    "is_read_only": false,
    "is_visible": true
  }
}
```


`PUT /accounts/:account_id/fields/:field_id`

Update a field definition.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters



* Parameter: type
  * Description: The input type.
* Parameter: name
  * Description: The label for the input field.
* Parameter: regex
  * Description: REGEX pattern to be used for validation. Ex.: "/[0-9]{2}-[0-9]{4}/". It is effective only for text input types.
* Parameter: is_required
  * Description: Indicate if an input value is required.
* Parameter: is_active
  * Description: Indicate if it is active.


Note: the _/input-types_ endpoint can be used to list allowed types.

Delete
------

> Request

```
curl -X DELETE "https://api.assinafy.com.br/v1/accounts/2120297080d55bdd13197/fields/63345ba3255f24a5bc7c75f0" \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`DELETE /accounts/:account_id/fields/:field_id`

Delete a field definition.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

Validate
--------

> Request

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/2120297080d55bdd13197/fields/63345ba3255f24a5bc7c75f0/validate?signer-access-code=hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrg" \
  -H 'Content-Type: application/json' \
  -d '{"value":"400.676.228-36"}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "type": "cpf",
    "success": true,
    "error_message": ""
  }
}
```


`POST /accounts/:accountId/fields/:field_id/validate`

Validate an input value against a field definition.

**Important:** The _Authorization_ header is used only when accessing as an authenticated user. When accessing as a signer, use the _signer-access-code_ URL parameter.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter         |Required|Description        |
|------------------|--------|-------------------|
|signer-access-code|true    |Signer access code.|


### Body Parameters


|Parameter|Required|Description                     |
|---------|--------|--------------------------------|
|value    |true    |The input value to be validated.|


Validate Multiple
-----------------

> Request

```
curl -X POST "https://api.assinafy.com.br/v1/accounts/2120297080d55bdd13197/fields/validate-multiple?signer-access-code=hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrg" \
  -H 'Content-Type: application/json' \
  -d '
[
  {
    "field_id": "63488ffb7adf435aba319787",
    "value": "1111111111111"
  },
  {
    "field_id": "63488ffb0461cebb70775497",
    "value": "[email protected]"
  }
]
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "field_id": "63488ffb7adf435aba319787",
      "type": "cpf",
      "success": false,
      "error_message": "Invalid CPF."
    },
    {
      "field_id": "63488ffb0461cebb70775497",
      "type": "email",
      "success": true,
      "error_message": ""
    }
  ]
}
```


`POST /accounts/:accountId/fields/validate-multiple`

Validate multiple input values at once.

**Important:** The _Authorization_ header is used only when accessing as an authenticated user. When accessing as a signer, use the _signer-access-code_ URL parameter.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter         |Required|Description        |
|------------------|--------|-------------------|
|signer-access-code|true    |Signer access code.|


### Body Parameters


|Parameter  |Required|Description                     |
|-----------|--------|--------------------------------|
|[].field_id|true    |The field definition ID.        |
|[].value   |true    |The input value to be validated.|


List Types
----------

> Request

```
curl "https://api.assinafy.com.br/v1/field-types"
  -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "type": "personName",
      "name": "Name"
    },
    {
      "type": "cpf",
      "name": "CPF"
    },
    {
      "type": "phoneNumber",
      "name": "Phone Number"
    },
    {
      "type": "postalCode",
      "name": "Postal Code"
    },
    {
      "type": "email",
      "name": "E-mail"
    },
    {
      "type": "cnpj",
      "name": "CNPJ"
    },
    {
      "type": "companyName",
      "name": "Company Name"
    },
    {
      "type": "email",
      "name": "E-mail"
    },
    {
      "type": "text",
      "name": "Text"
    },
    {
      "type": "number",
      "name": "Number"
    },
    {
      "type": "date",
      "name": "Date"
    }
  ]
}
```


`GET /field-types`

List possible field types.

### Header Parameters

*   `Authorization: Bearer {access_token}`

User
----

Create
------

> Request

```
curl -X POST https://api.assinafy.com.br/v1 \
-H 'Content-Type: application/json' \
-d '{
  "name": "Fabiana da Cruz",
  "email": "[email protected]",
  "telephone": "(55) 3499-0186",
  "government_id": "758.006.469-37",
  "terms": 1,
  "password": "3rfioAeritg45aler3"
  "utm_params": {
    "utm_landing_url": "http%3A%2F%2Fwww.domain.com",
    "utm_referrer": "http%3A%2F%2Fwww.referrerdomain.com",
    "utm_wiser_campaign": "black_friday",
    "utm_plan": "standard",
  }
}'
```


`POST /users`

Create an user account.

### Header Parameters

*   `Content-Type: application/json`

### Body Parameters


|Parameter    |Required|Description              |
|-------------|--------|-------------------------|
|name         |true    |User's full name.        |
|email        |true    |E-mail                   |
|password     |true    |Password                 |
|telephone    |false   |Telephone number         |
|government_id|false   |Taxpayer ID              |
|terms        |true    |Terms of use is accepted.|
|utm_params   |false   |UTM parameters.          |


Get
---

> Request

```
curl -X GET https://api.assinafy.com.br/v1/users/self \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "user": {
      "id": "85p6zqemanklok3b2gyx94dw",
      "name": "Martinho Rivera Carvalho",
      "email": "[email protected]",
      "telephone": "1737572483",
      "government_id": "22195356065",
      "is_email_verified": false,
      "has_accepted_terms": true,
      "is_password_set": true,
      "created_at": "2023-04-13T12:36:58Z",
      "to_be_deleted_at": null
    },
    "accounts": [
      {
        "id": "6437f76a53dde6d680a1e7ce",
        "name": "MC",
        "roles": [
          "owner"
        ],
        "is_delete_allowed": true,
        "created_at": "2023-04-13T12:36:58Z"
      }
    ]
  }
}
```


`GET /users/self`

Get the user information.

### Header Parameters

*   `Authorization: Bearer {access_token}`

Update
------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/users/self \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer wgjrz69xoakmgkl5m243dp8qwgjrz69xoakmgkl5m243dp8q' \
-d '
{
  "telephone": "(55) 3499-0186"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "user": {
      "id": "8dwrypzlq3v6m7ma65no9xje",
      "name": "Sr. Márcio da Cruz Jr.",
      "email": "[email protected]",
      "telephone": "5534990186",
      "government_id": "53952223328",
      "is_email_verified": false,
      "has_accepted_terms": true,
      "is_password_set": true,
      "created_at": "2023-04-13T12:42:26Z",
      "to_be_deleted_at": null
    },
    "accounts": [
      {
        "id": "6437f8b2695cbfd44b4ead03",
        "name": "SJ",
        "roles": [
          "owner"
        ],
        "is_delete_allowed": true,
        "created_at": "2023-04-13T12:42:26Z"
      }
    ]
  }
}
```


`PUT /users/self`

Update user profile.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters


|Parameter    |Required|Description          |
|-------------|--------|---------------------|
|name         |true    |User's name.         |
|email        |true    |User's email.        |
|telephone    |false   |User's telephone.    |
|government_id|false   |User's government ID.|


Request Email Verification
--------------------------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/users/request-email-verification \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrghAvmvk6Urzus3byLD2qOWrghAvmvk' \
-H 'Content-Type: application/json' \
-d '{
  "email": "[email protected]",
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "user": {
      "id": 71,
      "name": "Dr. Lilian Padrão Salazar Sobrinho",
      "email": "[email protected]",
      "telephone": null,
      "government_id": null,
      "is_email_verified": false
    },
    "accounts": [
      {
        "id": "69",
        "name": "DS"
      }
    ],
    "is_message_sent": true
  }
}
```


`PUT /users/request-email-verification`

Request email verification message to be sent.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters


|Parameter|Required|Description  |
|---------|--------|-------------|
|email    |true    |User's email.|


Verify Email
------------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/users/verify-email \
-H 'Content-Type: application/json'
-H 'Authorization: Bearear sdfsdfiuserweisfnwijerwejrwiejfakdfsdfnsmdnewrew' \
-d '{
  "email": "[email protected]",
  "code": "847657"
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": "92838b3e",
      "name": "John Smith",
      "email": "[email protected]",
      "is_email_verified": false,
      "created_at": "2022-09-28T01:22:59Z",
      "updated_at": "2022-09-28T01:22:59Z",
      "roles": [
        "owner"
      ]
    },
    {
      "id": "bd432835",
      "name": "John Smith",
      "email": "[email protected]",
      "is_email_verified": false,
      "created_at": "2022-09-28T01:23:00Z",
      "updated_at": "2022-09-28T01:23:00Z",
      "roles": [
        "organizer"
      ]
    }
  ]
}
```


`PUT /users/verify-email`

Verify an user account using a token or 6-digit code.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters


|Parameter|Required|Description                                                        |
|---------|--------|-------------------------------------------------------------------|
|token    |false   |The verification token from the activation link, received by email.|
|code     |false   |The verification code, received by email.                          |
|email    |false   |Required when code is sent.                                        |


Important: Either the _token_ or _code_ is required.

Delete
------

> Request

```
curl -X DELETE https://api.assinafy.com.br/v1/users/self \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer wgjrz69xoakmgkl5m243dp8qwgjrz69xoakmgkl5m243dp8q' \
-d '{
  "password": "jrz69xoakmgkl",
  "delete_reason_type": "SingleUse"
}'
```


> 200 Ok

```
{
  "status": 200,
  "message": "",
  "data": {
    "delete_status": "scheduled",
    "to_be_deleted_at": "2022-12-28T02:07:39Z"
  }
}
```


`DELETE /users/self`

Delete the user account and related workspaces where he/she is the owner.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters


|Parameter         |Required|Description                |
|------------------|--------|---------------------------|
|password          |True    |User's password.           |
|delete_reason_type|True    |Indicate the delete reason.|


**Note 1:** delete\_status might return _scheduled_ or _done_.  
Scheduled: the exclusion was scheduled and the _to\_be\_deleted\_at_ attribute indicates the date it will occurr.  
Done: no user worksace had no documents and exclusion was alaready completed.

**Note 2:** A _Scheduled_ delete has grace time of 30 days.

**Note 3:** The available delete types can be obtained from using the endpoint `GET /users/delete-reasons`.

Cancel Account Deletion
-----------------------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/users/self/cancel-delete \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer wgjrz69xoakmgkl5m243dp8qwgjrz69xoakmgkl5m243dp8q'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`PUT /users/self/cancel-delete`

Cancel a scheduled deletion for the account. It can only be requested while the account exclusion is not effectivated yet.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

**Note:** Exclusions that returned _done_ in the delete\_status attribute, cannot be undone.

List Delete Reasons
-------------------

> Request

```
curl -X GET https://api.assinafy.com.br/v1/users/delete-reasons \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "code": "ClosedBusiness",
      "name": "I closed my business."
    },
    {
      "code": "FeatureNotFound",
      "name": "It does not have a feature I need."
    },
    {
      "code": "AnotherPlatform",
      "name": "I am using another platform."
    },
    {
      "code": "SingleUse",
      "name": "I used it for an eventual need."
    },
    {
      "code": "Price",
      "name": "Pricing does not fit in my budget."
    }
  ]
}
```


`GET /users/delete-reasons`

List possible reasons for account deletion.

### Header Parameters

*   `Authorization: Bearer {access_token}`

User Invitation
---------------

Create
------

> Request

```
curl -X POST https://api.assinafy.com.br/v1/user-invitations \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
-H 'Content-Type: application/json' \
-d '
{
  "account_id": "383",
  "email": "[email protected]",
  "role": "owner"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "id": "f968ec50d127f47c33c5173bc7970906",
    "email": "[email protected]",
    "account_id": 383,
    "role": "owner",
    "inviter_user_id": "438",
    "invited_user_id": null,
    "status": "Sent",
    "expires_at": "2022-06-29 20:18:54",
    "created_at": "2022-06-22 20:18:54",
    "updated_at": "2022-06-22 20:18:54",
    "fulfillment_url": "https://api.assinafy.com.br/v1/invitation/f968ec50d127f47c33c5173bc7970906",
    "is_expired": false
  }
}
```


`POST /user-invitations`

Create an user invitation and send an email to the invitee.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters



* Parameter: account_id
  * Required: true
  * Description: The account the user is invited to.
* Parameter: email
  * Required: true
  * Description: Invited user's email.
* Parameter: role
  * Required: true
  * Description: The initial role of the user. Multiple values separated by comma are allowed. Possible roles: owner, organizer.
* Parameter: expires_at
  * Required: false
  * Description: The date and time when the invitation expires. A null value indicates no expiration. When the attribue is not sent, the default (7 days from now) will be used. Format: YYYY-MM-DD HH:MM.


Get
---

> Request

```
curl -X GET https://api.assinafy.com.br/v1/f968ec50d127f47c33c5173bc7970906 \
-H 'Content-Type: application/json'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "id": "f968ec50d127f47c33c5173bc7970906",
    "email": "[email protected]",
    "account_id": 383,
    "role": "owner",
    "inviter_user_id": "438",
    "invited_user_id": null,
    "status": "Sent",
    "expires_at": "2022-06-29 20:18:54",
    "created_at": "2022-06-22 20:18:54",
    "updated_at": "2022-06-22 20:18:54",
    "fulfillment_url": "https://api.assinafy.com.br/v1/invitation/f968ec50d127f47c33c5173bc7970906",
    "is_expired": false
  }
}
```


`GET /user-invitations/:invitation_id`

Get invitation info.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter    |Required|Description       |
|-------------|--------|------------------|
|invitation_id|true    |The invitation ID.|


Sign Up
-------

> Request

```
curl -X "https://api.assinafy.com.br/v1/user-invitations/f83b80d20d2561b12d9137b09902e0c9/fulfill" \
-H 'Content-Type: application/json' \
-d '
{
  "name": "Antonieta Batista Montenegro",
  "email": "[email protected]",
  "telephone": "(85) 4650-8583",
  "terms": true,
  "government_id": "915.240.595-87",
  "password": "P3Sy!6&hs$Ny"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "invitation": {
      "id": "f83b80d20d2561b12d9137b09902e0c9",
      "email": "[email protected]",
      "account_id": "6335998d4daeeb761549aa76",
      "role": "owner",
      "inviter_user_id": "8e366235",
      "invited_user_id": "d935993a",
      "status": "Fulfilled",
      "expires_at": "2022-10-06T13:11:42Z",
      "created_at": "2022-09-29T13:11:42Z",
      "updated_at": "2022-09-29T13:11:42Z",
      "fulfillment_url": "https://api.assinafy.com.br/v1/invitation/f83b80d20d2561b12d9137b09902e0c9",
      "is_expired": false
    },
    "user": {
      "id": "d935993a",
      "name": "Dr. Gabriela Paes",
      "email": "[email protected]",
      "telephone": null,
      "government_id": null,
      "is_email_verified": true,
      "has_accepted_terms": true
    },
    "accounts": [
      {
        "id": "6335998d4daeeb761549aa76",
        "name": "KN",
        "created_at": "2022-09-29T13:11:41Z"
      }
    ],
    "access_token": "rLnEZerpWQQHCteEQZDRDVDHCXmWq9c5hXsnpH6UeL0sO-VnQuFWC5_4qUEElzNc"
  }
}
```


`POST /user-invitations/:invitation_id/fulfill`

Create an user account through an invitation.

### Header Parameters

*   `Content-Type: application/json`

### URL Parameters


|Parameter    |Required|Description       |
|-------------|--------|------------------|
|invitation_id|true    |The invitation ID.|


### Body Parameters


|Parameter    |Required|Description                                         |
|-------------|--------|----------------------------------------------------|
|name         |true    |User's full name.                                   |
|email        |true    |User's email.                                       |
|password     |true    |User's password.                                    |
|telephone    |false   |User's telephone.                                   |
|terms        |true    |A boolean indicating if terms & conditions accepted.|
|government_id|false   |Taxpayer ID.                                        |


Delete
------

> Request

```
curl -X DELETE  https://api.assinafy.com.br/v1/user-invitations/f968ec50d127f47c33c5173bc7970906 \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
-H 'Content-Type: application/json'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`DELETE /user-invitations/:invitation_id`

Delete an invitation.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter    |Required|Description       |
|-------------|--------|------------------|
|invitation_id|true    |The invitation ID.|


Assign Role
-----------

> Request

```
curl -X POST https://api.assinafy.com.br/v1/accounts/a292838b3e92838b3e/assign-role \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer 38b3e38b3e38b3e38b3e38b3e38b3e38b3e38b3e38b3e38b3e3' \
-d '{
  "user_id": "92838b3e",
  "role": "organizer"
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`POST /accounts/:account_id/assign-role`

Assign one or more roles to an user.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


### Body Parameters



* Parameter: user_id
  * Required: true
  * Description: The user ID.
* Parameter: role
  * Required: true
  * Description: The role to be assigned. It accepts multiple roles separated by comma. Possible roles: organizer.


Revoke Role
-----------

> Request

```
curl -X POST https://api.assinafy.com.br/v1/accounts/abc123/revoke-role \
-H 'Content-Type: application/json' \
-H 'Authorization: Bearer 3892838b3eb3e3892838b3eb3e3892838b3eb3e3892838b3' \
-d '{
  "user_id": "92838b3e",
  "role": "organizer"
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`POST /accounts/:account_id/revoke-role`

Revoke one or more roles from an user.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


### Body Parameters


|Parameter|Required|Description                                                              |
|---------|--------|-------------------------------------------------------------------------|
|user_id  |true    |The user ID.                                                             |
|role     |true    |The role to be revoked. It will accept multiple roles separated by comma.|


Important: The workspace should always have at least one owner user. If after revoking a role, the workspace would have not owner, an error will be returned.

Get Permissions
---------------

> Request

```
curl -X GET https://api.assinafy.com.br/v1/accounts/9283892838b3eb3e/permissions \
-H 'Authorization: Bearer 3892838b3eb3e3892838b3eb3e3892838b3eb3e3892838b3'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "name": "account/update",
      "route": "put /accounts/{account_id}",
      "is_allowed": true
    },
    {
      "name": "account/theme",
      "route": "get /accounts/{account_id}/theme",
      "is_allowed": true
    },
    // (...)
  ]
}
```


`GET /accounts/:account_id/permissions`

List permissions for the user within his workspace.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


Workspace
---------

Create
------

> Request

```
curl -X POST 'https://api.assinafy.com.br/v1/accounts' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' \
-H 'Content-Type: application/json' -d '
{
  "name": "Workspace Name",
  "primary_color": "999999",
  "secondary_color": "AAAAAA"
}
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "id": "631b4af277a4a46097e39252",
    "name": "Workspace Name",
    "primary_color": "999999",
    "secondary_color": "AAAAAA",
    "created_at": "2022-09-09T14:17:22Z"
  }
}
```


`POST /accounts`

Create a new workspace.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### Body Parameters



* Parameter: name
  * Required: true
  * Description: The account name.
* Parameter: primary_color
  * Required: false
  * Description: Primary color. When not set, the default is used.
* Parameter: secondary_color
  * Required: false
  * Description: Secondary color. When not set, the primary color is used. If the primary is not set, the default is used.


List
----

> Request

```
curl -X GET 'https://api.assinafy.com.br/v1/accounts'
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": "131b4af277a4a46097e39252",
      "name": "Account 1",
      "is_delete_allowed": true,
      "roles": ["owner"],
      "created_at": "2022-09-09T14:17:22Z"
    },
    {
      "id": "231b4af277a4a46097e39252",
      "name": "Account 2",
      "is_delete_allowed": true,
      "roles": ["owner"],
      "created_at": "2022-09-10T10:17:22Z"
    },
  ]
}
```


`GET /accounts`

List workspaces of the user. Records are ordered according to last interaction, with most recent coming first.

### Header Parameters

*   `Authorization: Bearer {access_token}`

Get
---

> Request

```
curl -X GET 'https://api.assinafy.com.br/v1/accounts/631b4af277a4a46097e39252' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "id": "631b4af277a4a46097e39252",
    "name": "Name 631b4af2d17c1",
    "primary_color": "999999",
    "secondary_color": "aaaaaa",
    "created_at": "2022-09-09T14:17:22Z"
  }
}
```


`GET /accounts/:accountId`

Get workspace data.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter|Required|Description           |
|---------|--------|----------------------|
|accountId|true    |The ID of the account.|


Update
------

> Request

```
curl -X PUT 'https://api.assinafy.com.br/v1/accounts/abc123' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' -d '
{
  "name": "Account Name",
  "primary_color": "999999",
  "secondary_color": null
}
'
```


`PUT /accounts/:account_id`

Update workspace.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


### Body Parameters



* Parameter: name
  * Default: 
  * Required: false
  * Description: The account name.
* Parameter: primary_color
  * Default: 
  * Required: false
  * Description: Primary color. When not set, the default is used.
* Parameter: secondary_color
  * Default: 
  * Required: false
  * Description: Secondary color. When not set, the primary color is used. If the primary is not set, the default is used.


Delete
------

> Request

```
curl -X DELETE 'https://api.assinafy.com.br/v1/accounts/6Urzus3byL6Urzus3byL6Urzus3byL' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


`DELETE /accounts/:account_id`

> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


Delete workspace.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                        |
|----------|--------|-----------------------------------|
|account_id|true    |The ID of the account to be delete.|


Upload Logo
-----------

> Request example

```
curl -X POST 'https://api.assinafy.com.br/v1/accounts/abc123/logo' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' -F 'file=@/tmp/logo.png'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "mime_type": "image/png",
    "version": 1660157833,
    "updated_at": "2022-08-10 14:57:13"
  }
}
```


> Full HTML/JS Request

```
<!DOCTYPE html>
<html>
<body>

<div >
  <input type="file" name="file" id="file">
  <input type="button" id="btn_uploadfile"
     value="Upload"
     onclick="uploadFile();" >
</div>

<script>
function uploadFile()
{
   var files = document.getElementById("file").files;

   if (files.length == 0) {
     alert("Please select a file");
     return false;
   }

    var formData = new FormData();
    formData.append("file", files[0]);
    var xhttp = new XMLHttpRequest();

    xhttp.open("POST", "https://api.assinafy.com.br/v1/accounts/1a/logo", true);
    xhttp.setRequestHeader("Authorization", "Bearer xsdfa23423ji423ui4u23i432u2i34u32iu3iuisfsd");

    xhttp.onreadystatechange = function() {
      if (this.readyState == 4 && this.status == 200) {
          // var response = this.responseText;
          if (this.status == 200) {
            alert("Upload successfully.");
          } else {
            alert("File not uploaded.");
          }
        }
    };

    xhttp.send(formData);
}
</script>

</body>
</html>
```


`POST /accounts/:account_id/logo`

Upload the workspace logo.

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

Get Logo
--------

> Request

```
curl -X GET 'https://api.assinafy.com.br/v1/accounts/abc123/logo' \ 
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
content-disposition: attachment; filename=logo-1-logo_v1660158541.png
content-type: image/png
content-length: 68

PNG [binary-data-here]
```


`GET /accounts/:account_id/logo`

Download the workspace logo. The response is an image stream.

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


### Header Parameters

*   `Authorization: Bearer {access_token}`

Delete Logo
-----------

> Request

```
curl -X DELETE 'https://api.assinafy.com.br/v1/accounts/660158541660158541/logo' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": []
}
```


`DELETE /accounts/:account_id/logo`

Delete an existing workspace logo.

### URL Parameters


|Parameter |Required|Description    |
|----------|--------|---------------|
|account_id|true    |The account ID.|


### Header Parameters

*   `Authorization: Bearer {access_token}`

Get Theme
---------

> Request

```
curl -X GET 'https://api.assinafy.com.br/v1/accounts/abc123/theme' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "account_name": "Account Name",
    "primary_color": "aabbcc",
    "secondary_color": "aabbcc",
    "logo": "https://api.assinafy.com.br/v1/accounts/1a/logo"
  }
}
```


`GET /accounts/:account_id/theme`

Retrieve account theme information.

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


### Header Parameters

*   `Authorization: Bearer {access_token}`

Get User
--------

> Request

```
curl -X GET 'https://api.assinafy.com.br/v1/accounts/abc123/users/bd432835' \ 
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "id": "bd432835",
    "name": "John Smith",
    "email": "[email protected]",
    "is_email_verified": false,
    "is_active": false,
    "created_at": "2022-09-30T13:51:19Z",
    "updated_at": "2022-09-30T13:51:19Z",
    "roles": [
      "organizer"
    ]
  }
}
```


`GET /accounts/:account_id/users/:user_id`

Get workspace user by ID.

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|
|user_id   |true    |The user ID.                     |


### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

List Users
----------

> Request

```
curl -X GET 'https://api.assinafy.com.br/v1/accounts/abc123/users' \
-H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": "92838b3e",
      "name": "John Smith",
      "email": "[email protected]",
      "is_email_verified": false,
      "is_active": true,
      "created_at": "2022-09-28T01:22:59Z",
      "updated_at": "2022-09-28T01:22:59Z",
      "roles": [
        "owner"
      ]
    }
  ]
}
```


`GET /accounts/:account_id/users`

List workspace users.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


Activate User
-------------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/accounts/abc123/users/bd432835/activate
-H 'Content-Type: application/json'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "user_id": "bd432835",
    "account_id": "abc123",
    "is_active": true
  }
}
```


`PUT /accounts/:account_id/users/:user_id/activate`

Activate user.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                        |
|----------|--------|-----------------------------------|
|account_id|true    |The account ID.                    |
|user_id   |true    |The ID of the user to be activated.|


Inactivate User
---------------

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/accounts/abc123/users/bd432835/inactivate \
-H 'Content-Type: application/json'
'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "user_id": "bd432835",
    "account_id": "abc123",
    "is_active": false
  }
}
```


`PUT /accounts/:account_id/users/:user_id/inactivate`

Inactivate an user in a workspace.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|
|user_id   |true    |The user ID to be inactivated.   |


Note: A user can inactivate his own account.

Delete User
-----------

> Request

```
curl -X DELETE https://api.assinafy.com.br/v1/accounts/3a63df93a63df93a63df9/users/3a63df93a63df93a63df9
```


`DELETE /accounts/:account_id/users/:user_id`

Remove user from workspace.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

List Members
------------

> Request example

```
curl -X GET -H 'Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg' '/accounts/abc123/members'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "type": "User",
      "id": "92838b3e",
      "name": "John Smith",
      "email": "[email protected]",
      "roles": [
        "owner"
      ]
    },
    {
      "type": "Invitation",
      "id": "3a63df93a63df93a63df9",
      "name": "6336f23a63df9",
      "email": "[email protected]",
      "roles": [
        "organizer"
      ]
    }
  ]
}
```


`GET /accounts/:account_id/members`

Get workspace members, including pending invitations.

### URL Parameters


|Parameter |Required|Description                      |
|----------|--------|---------------------------------|
|account_id|true    |The related workspace account ID.|


### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

Leave
-----

`PUT /accounts/:account_id/leave`

Allows an user to leave an account (workspace). When the account has no other user left, it will be deleted. When the user record is not related to any other account, it will also be deleted.

**Headers**:

*   `Content-Type` - `application/json`
*   `Authorization` - `Bearer {access_token}`

> Request

```
curl -X PUT https://api.assinafy.com.br/v1/accounts/:account_id/leave \
-H 'Content-Type: application/json' 
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "has_deleted_user_account": true,
    "user_account_delete_info": {
      "delete_status": "done",
      "to_be_deleted_at": null
    }
  }
}
```


Webhooks
--------

> Example of payload:

```
{
  "id":987,
  "event":"document_ready",
  "object":{
    "id": "efo39340da030af0g",
    "name":"document.pdf",
    "type":"document"
  },
  "subject":{
    "id": "efo39340da030af0g",
    "name":"John Doe",
    "type":"user"
  },
  "account_id":"o39340do39340d"
}
```


Webhooks allow your application to **receive real-time notifications** whenever specific events occur in our system. Instead of periodically polling our API, you can subscribe to events and automatically receive an HTTP request containing event data.

Using the Webhooks API, you can:

*   **Subscribe** to one or more event types;
*   **Inactivate** when you no longer need updates;
*   **Receive notifications** at your configured endpoint whenever those events happen.

### How it works

1.  You register your webhook URL via the **subscription endpoint**.
2.  Whenever an event occurs (e.g., `document_ready`), our system sends a `POST` request with a JSON payload to your endpoint.
3.  Your server acknowledges the event with an HTTP `200 OK` response.
4.  You can later **unsubscribe** by inactivating webhook settings at any time.

Get Subscription
----------------

> Request

```
curl -X GET "https://api.assinafy.com.br/v1/accounts/Avmvk6Urzus3byLD2/webhooks/subscriptions" \
-H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "events": [
      "document_ready",
      "document_prepared"
    ],
    "is_active": true,
    "url": "http://example.com?test=1",
    "email": "[email protected]",
    "updated_at": "2023-05-10T14:58:24Z"
  }
}
```


`GET /accounts/{account_id}/webhooks/subscriptions`

Retrieves the current webhook subscription status for a specific account. Use this endpoint to check which events the account is currently subscribed to and verify the delivery configuration.

### Header Parameters

*   `Authorization: Bearer {access_token}`

### URL Parameters


|Parameter |Required|Description                                          |
|----------|--------|-----------------------------------------------------|
|account_id|true    |The ID of the account which is related to the events.|


Update Subscription
-------------------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/accounts/Avmvk6Urzus3byLD2/webhooks/subscriptions" \
-H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg" \
-H "Content-Type: application/json" \
-d '
{
  "events": [
    "document_ready",
    "document_prepared"
  ],
  "is_active": true,
  "url": "http://example.com?test=1",
  "email": "[email protected]"
}'
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "events": [
      "document_ready",
      "document_prepared"
    ],
    "is_active": true,
    "url": "http://example.com?test=1",
    "email": "[email protected]",
    "updated_at": "2023-05-10T14:58:24Z"
  }
}
```


`PUT /accounts/{account_id}/webhooks/subscriptions`

Updates the webhook subscription settings for a specific account. Use this endpoint to modify which events are being monitored, enable or disable notifications, and update the delivery or contact details.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters



* Parameter: account_id
  * Required: true
  * Description: Unique identifier of the account whose webhook subscription you want to update.


### Body Parameters



* Parameter: events
  * Required: true
  * Description: Array with list of events to subscribe to.
* Parameter: is_active
  * Required: true
  * Description: Boolean indicating whether events should be notified to webhook.
* Parameter: url
  * Required: true
  * Description: The URL which will receive events.
* Parameter: email
  * Required: true
  * Description: The email address that will receive important information related to webhook communication.


Inactivate
----------

> Request

```
curl -X PUT "https://api.assinafy.com.br/v1/accounts/Avmvk6Urzus3byLD2/webhooks/inactivate" \
-H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": {
    "events": [
      "document_ready",
      "document_prepared"
    ],
    "is_active": false,
    "url": "http://example.com?myparam=value",
    "email": "[email protected]",
    "updated_at": "2023-05-10T14:58:24Z"
  }
}
```


`PUT /accounts/{account_id}/webhooks/inactivate`

Deactivates the webhook integration for a specific account. While the integration is inactive, no events will be sent to the configured webhook endpoint.

### Header Parameters

*   `Content-Type: application/json`
*   `Authorization: Bearer {access_token}`

### URL Parameters



* Parameter: account_id
  * Required: true
  * Description: Unique identifier of the account whose webhook integration should be deactivated.


List Types
----------

> Request

```
curl -X GET "https://api.assinafy.com.br/v1/webhooks/event-types" \
-H "Authorization: Bearer hAvmvk6Urzus3byLD2qOWrg"
```


> 200 OK

```
{
  "status": 200,
  "message": "",
  "data": [
    {
      "id": "document_prepared",
      "description": "Triggered when the User as subject prepares a Document."
    },
    {
      "id": "document_metadata_ready",
      "description": "Triggered when the document is ready to be prepared. The the document has been normalized to PDF and its pages are available"
    },
    {
      "id": "document_ready",
      "description": "Triggered when the last Signer of the assignment signs the Document, as a result, the document status becomes ready."
    },
    {
      "id": "document_uploaded",
      "description": "Triggered when the User has uploaded a Document"
    },
    {
      "id": "signature_requested",
      "description": "Triggered when the User requested signature of a Document"
    },
    {
      "id": "signer_created",
      "description": "Triggered when the User created a Signer"
    },
    {
      "id": "signer_email_verified",
      "description": "Triggered when Signer's email has been verified by a verification code linked to a Document"
    },
    {
      "id": "signer_signed_document",
      "description": "Triggered when the Signer signed a Document"
    },
    {
      "id": "signer_rejected_document",
      "description": "Triggered when the Signer rejected signing a Document"
    },
    {
      "id": "signer_viewed_document",
      "description": "Triggered when the Signer viewed a Document for the first time"
    },
    {
      "id": "document_processing_failed",
      "description": "Unprocessable document, either invalid or the system couldn't process it"
    }
  ]
}
```


`GET /webhooks/event-types`

Retrieves the list of all available event types that can be subscribed to via webhooks. Use this endpoint to discover which events your application can receive notifications for.

### Header Parameters

*   `Authorization: Bearer {access_token}`