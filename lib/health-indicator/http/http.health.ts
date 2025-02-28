import { Injectable, Scope } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '..';
import { HealthCheckError } from '../../health-check/health-check.error';
import { lastValueFrom, Observable } from 'rxjs';
import { ModuleRef } from '@nestjs/core';
import { checkPackages, isAxiosError } from '../../utils';
import type * as NestJSAxios from '@nestjs/axios';
import { AxiosRequestConfig, AxiosResponse } from './axios.interfaces';
import { Logger } from '@nestjs/common/services/logger.service';
import { URL } from 'url';
import { AxiosError } from '../../errors/axios.error';

const logger = new Logger('HttpHealthIndicator');

interface HttpClientLike {
  request<T = any>(config: any): Observable<AxiosResponse<T>>;
}

/**
 * The HTTPHealthIndicator contains health indicators
 * which are used for health checks related to HTTP requests
 *
 * @publicApi
 * @module TerminusModule
 */
@Injectable({
  scope: Scope.TRANSIENT,
})
export class HttpHealthIndicator extends HealthIndicator {
  private nestJsAxios!: typeof NestJSAxios;
  /**
   * Initializes the health indicator
   * @param httpService The HttpService provided by Nest
   */
  constructor(private readonly moduleRef: ModuleRef) {
    super();
    this.checkDependantPackages();
  }

  /**
   * Checks if the dependant packages are present
   */
  private checkDependantPackages() {
    this.nestJsAxios = checkPackages(
      ['@nestjs/axios'],
      this.constructor.name,
    )[0];
  }

  private getHttpService() {
    try {
      return this.moduleRef.get(this.nestJsAxios.HttpService, {
        strict: false,
      });
    } catch (err) {
      logger.error(
        'It seems like "HttpService" is not available in the current context. Are you sure you imported the HttpModule from the @nestjs/axios package?',
      );
      throw new Error(
        'It seems like "HttpService" is not available in the current context. Are you sure you imported the HttpModule from the @nestjs/axios package?',
      );
    }
  }

  /**
   * Prepares and throw a HealthCheckError
   * @param key The key which will be used for the result object
   * @param error The thrown error
   *
   * @throws {HealthCheckError}
   */
  private generateHttpError(key: string, error: AxiosError | any) {
    if (isAxiosError(error)) {
      const response: { [key: string]: any } = {
        message: error.message,
      };
      if (error.response) {
        response.statusCode = error.response.status;
        response.statusText = error.response.statusText;
      }
      throw new HealthCheckError(
        error.message,
        this.getStatus(key, false, response),
      );
    }
  }

  /**
   * Checks if the given url response in the given timeout
   * and returns a result object corresponding to the result
   * @param key The key which will be used for the result object
   * @param url The url which should be request
   * @param options Optional axios options
   *
   * @throws {HealthCheckError} In case the health indicator failed
   *
   * @example
   * httpHealthIndicator.pingCheck('google', 'https://google.com', { timeout: 800 })
   */
  async pingCheck(
    key: string,
    url: string,
    {
      httpClient,
      ...options
    }: AxiosRequestConfig & { httpClient?: HttpClientLike } = {},
  ): Promise<HealthIndicatorResult> {
    let isHealthy = false;
    // In case the user has a preconfigured HttpService (see `HttpModule.register`)
    // we just let him/her pass in this HttpService so that he/she does not need to
    // reconfigure it.
    // https://github.com/nestjs/terminus/issues/1151
    const httpService = httpClient || this.getHttpService();

    try {
      await lastValueFrom(httpService.request({ url, ...options }));
      isHealthy = true;
    } catch (err) {
      this.generateHttpError(key, err);
    }

    return this.getStatus(key, isHealthy);
  }

  async responseCheck<T>(
    key: string,
    url: URL | string,
    callback: (response: AxiosResponse<T>) => boolean | Promise<boolean>,
    {
      httpClient,
      ...options
    }: AxiosRequestConfig & { httpClient?: HttpClientLike } = {},
  ): Promise<HealthIndicatorResult> {
    const httpService = httpClient || this.getHttpService();

    let response: AxiosResponse;
    let axiosError: AxiosError | null = null;

    try {
      response = await lastValueFrom(
        httpService.request({ url: url.toString(), ...options }),
      );
    } catch (error) {
      if (isAxiosError(error) && error.response) {
        response = error.response;
        axiosError = error;
      } else {
        throw error;
      }
    }

    const isHealthy = await callback(response);

    if (!isHealthy) {
      if (axiosError) {
        throw this.generateHttpError(key, axiosError);
      }

      throw new HealthCheckError(
        `${key} is not available`,
        this.getStatus(key, false),
      );
    }

    return this.getStatus(key, true);
  }
}
