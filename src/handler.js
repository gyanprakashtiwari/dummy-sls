import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import AWS from "aws-sdk";
import { v4 } from "uuid";
import * as yup from "yup";

const docClient = new AWS.DynamoDB.DocumentClient();
const CountryTableName = "CountryTable";
const headers = {
  "content-type": "application/json",
};

const countrySchema = yup.object().shape({
  name: yup.string().required(),
  capital: yup.string().required(),
  region: yup.string().required(),
  currency: yup.string().required()
});

export const addCountry = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const reqBody = JSON.parse(event.body as string);

    await countrySchema.validate(reqBody, { abortEarly: false });

    const country = {
      ...reqBody,
      countryID: v4(),
    };

    await docClient
      .put({
        TableName: CountryTableName,
        Item: country,
      })
      .promise();

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(country),
    };
  } catch (e) {
    return handleError(e);
  }
};

class HttpError extends Error {
  constructor(public statusCode: number, body: Record<string, unknown> = {}) {
    super(JSON.stringify(body));
  }
}

export const getCountryByID = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const country = await fetchCountryById(event.pathParameters?.id as string);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(country),
    };
  } catch (e) {
    return handleError(e);
  }
};

const fetchCountryById = async (id: string) => {
  const output = await docClient
    .get({
      TableName: tableName,
      Key: {
        countryID: id,
      },
    })
    .promise();

  if (!output.Item) {
    throw new HttpError(404, { error: "not found" });
  }

  return output.Item;
};

/*
const handleError = (e: unknown) => {
  if (e instanceof yup.ValidationError) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        errors: e.errors,
      }),
    };
  }

  if (e instanceof SyntaxError) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: `invalid request body format : "${e.message}"` }),
    };
  }

  if (e instanceof HttpError) {
    return {
      statusCode: e.statusCode,
      headers,
      body: e.message,
    };
  }

  throw e;
};



export const updateProduct = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const id = event.pathParameters?.id as string;

    await fetchProductById(id);

    const reqBody = JSON.parse(event.body as string);

    await schema.validate(reqBody, { abortEarly: false });

    const product = {
      ...reqBody,
      productID: id,
    };

    await docClient
      .put({
        TableName: tableName,
        Item: product,
      })
      .promise();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(product),
    };
  } catch (e) {
    return handleError(e);
  }
};

export const deleteProduct = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  try {
    const id = event.pathParameters?.id as string;

    await fetchProductById(id);

    await docClient
      .delete({
        TableName: tableName,
        Key: {
          productID: id,
        },
      })
      .promise();

    return {
      statusCode: 204,
      body: "",
    };
  } catch (e) {
    return handleError(e);
  }
};

export const listProduct = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const output = await docClient
    .scan({
      TableName: tableName,
    })
    .promise();

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(output.Items),
  };
};
*/