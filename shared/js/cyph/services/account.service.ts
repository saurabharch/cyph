/* eslint-disable max-lines */

import {Injectable, NgZone} from '@angular/core';
import {
	ActivatedRoute,
	Data,
	NavigationEnd,
	Params,
	Router,
	UrlSegment
} from '@angular/router';
import * as Hammer from 'hammerjs';
import {BehaviorSubject, combineLatest, Observable, of} from 'rxjs';
import {filter, map, mergeMap, skip, take} from 'rxjs/operators';
import {SecurityModels, User} from '../account';
import {BaseProvider} from '../base-provider';
import {ContactComponent} from '../components/contact';
import {IResolvable} from '../iresolvable';
import {CyphPlans, NeverProto, NotificationTypes, StringProto} from '../proto';
import {toBehaviorSubject} from '../util/flatten-observable';
import {toInt} from '../util/formatting';
import {getOrSetDefault} from '../util/get-or-set-default';
import {observableAll} from '../util/observable-all';
import {prettyPrint, stringify} from '../util/serialization';
import {getTimestamp} from '../util/time';
import {translate} from '../util/translate';
import {uuid} from '../util/uuid';
import {resolvable, sleep} from '../util/wait';
import {AccountAppointmentsService} from './account-appointments.service';
import {AccountContactsService} from './account-contacts.service';
import {AccountFilesService} from './account-files.service';
import {AccountSettingsService} from './account-settings.service';
import {AccountUserLookupService} from './account-user-lookup.service';
import {ConfigService} from './config.service';
import {AccountAuthService} from './crypto/account-auth.service';
import {AccountDatabaseService} from './crypto/account-database.service';
import {PotassiumService} from './crypto/potassium.service';
import {DialogService} from './dialog.service';
import {EnvService} from './env.service';
import {FingerprintService} from './fingerprint.service';
import {NotificationService} from './notification.service';
import {StringsService} from './strings.service';
import {WindowWatcherService} from './window-watcher.service';

/**
 * Account service.
 */
@Injectable()
export class AccountService extends BaseProvider {
	/** @ignore */
	private readonly _UI_READY = resolvable();

	/** @ignore */
	private readonly chatBlurReloadTimeout = 60000;

	/** @ignore */
	private readonly headerInternal = new BehaviorSubject<
		string | {desktop?: string; mobile?: string} | User | undefined
	>(undefined);

	/** @ignore */
	private readonly menuExpandedInternal = new BehaviorSubject<boolean>(
		!this.envService.isMobile.value
	);

	/** @ignore */
	private readonly mobileMenuOpenInternal = new BehaviorSubject<boolean>(
		false
	);

	/** @ignore */
	private readonly pushNotificationsActive = resolvable();

	/** @ignore */
	private readonly transitionInternal = new BehaviorSubject<boolean>(false);

	/** Active sidebar contact username. */
	public readonly activeSidebarContact = new BehaviorSubject<
		string | undefined
	>(undefined);

	/** Indicates whether real-time Docs is enabled. */
	public readonly enableDocs: Observable<boolean> = of(
		this.envService.debug ||
			(!!this.envService.environment.customBuild &&
				this.envService.environment.customBuild.config.enableDocs ===
					true)
	);

	/** Indicates whether Passwords is enabled. */
	public readonly enablePasswords: Observable<boolean> = this.envService
		.debug ?
		of(true) :
		this.accountSettingsService.plan.pipe(
			map(plan => plan === CyphPlans.FoundersAndFriends)
		);

	/** Indicates whether Wallets is enabled. */
	public readonly enableWallets: Observable<boolean> =
		this.envService.debug ||
		(!!this.envService.environment.customBuild &&
			this.envService.environment.customBuild.config.enableWallets ===
				true) ?
			of(true) :
			this.accountSettingsService.plan.pipe(
				map(plan => plan === CyphPlans.FoundersAndFriends)
			);

	/** Email address to use for new pseudo-account. */
	public readonly fromEmail = new BehaviorSubject<string>('');

	/** `fromEmail` autocomplete options. */
	public readonly fromEmailOptions = combineLatest([
		this.accountAppointmentsService.pastEmailContacts,
		this.fromEmail
	]).pipe(
		map(([options, email]) => {
			email = email.trim().toLowerCase();
			return options.filter(option => option.email.startsWith(email));
		})
	);

	/** Name to use for new pseudo-account. */
	public readonly fromName = new BehaviorSubject<string>('');

	/** `fromName` autocomplete options. */
	public readonly fromNameOptions = combineLatest([
		this.accountAppointmentsService.pastEmailContacts,
		this.fromName
	]).pipe(
		map(([options, name]) => {
			name = name.trim().toLowerCase();
			return options.filter(option =>
				option.name.toLowerCase().startsWith(name)
			);
		})
	);

	/** Header title for current section. */
	public readonly header: Observable<
		{desktop?: string; mobile?: string} | User | undefined
	>;

	/** Indicates the status of the interstitial. */
	public readonly incomingCallAnswers = new Map<
		string,
		IResolvable<boolean>
	>();

	/** Indicates the status of the interstitial. */
	public readonly interstitial = new BehaviorSubject<boolean>(false);

	/** Indicates whether the UI is ready. */
	public readonly isUiReady = new BehaviorSubject<boolean>(false);

	/** Maximum length of profile description. */
	public readonly maxDescriptionLength: number = 1000;

	/** Maximum length of name. */
	public readonly maxNameLength: number = 250;

	/** Indicates whether menu can be expanded. */
	public readonly menuExpandable: Observable<boolean>;

	/** Indicates whether menu is expanded. */
	public readonly menuExpanded: Observable<boolean>;

	/** Minimum expanded menu width. */
	public readonly menuExpandedMinWidth: number = this.envService
		.isTelehealthFull ?
		325 :
		275;

	/** Minimum expanded menu width pixels string. */
	public readonly menuExpandedMinWidthPX: string = `${this.menuExpandedMinWidth.toString()}px`;

	/** Menu width. */
	public readonly menuMaxWidth: Observable<string>;

	/** Menu minimum width. */
	public readonly menuMinWidth: number = this.menuExpandedMinWidth * 2.5;

	/** Indicates whether simplified menu should be displayed. */
	public readonly menuReduced: Observable<
		boolean
	> = this.windowWatcherService.width.pipe(
		map(width => width <= this.configService.responsiveMaxWidths.xs)
	);

	/** Indicates whether mobile menu is open. */
	public readonly mobileMenuOpen: Observable<boolean> = combineLatest([
		this.envService.isMobile,
		this.mobileMenuOpenInternal
	]).pipe(map(([isMobile, mobileMenuOpen]) => isMobile && mobileMenuOpen));

	/** Resolves ready promise. */
	public readonly resolveUiReady: () => void = this._UI_READY.resolve;

	/** Route change listener. */
	public readonly routeChanges = toBehaviorSubject<string>(
		this.router.events.pipe(
			filter(
				event =>
					event instanceof NavigationEnd &&
					event.url !== this.currentRoute
			),
			map(({url}: any) => url)
		),
		this.router.url,
		this.subscriptions
	);

	/** Indicates when view is in transition. */
	public readonly transition: Observable<boolean> = this.transitionInternal;

	/** Resolves after UI is ready. */
	public readonly uiReady: Promise<void> = this._UI_READY.promise;

	/** Total count of unread messages. */
	public readonly unreadMessages: Observable<number> = toBehaviorSubject(
		this.accountContactsService.contactList.pipe(
			mergeMap(users =>
				observableAll(users.map(user => user.unreadMessageCount))
			),
			map(unreadCounts => unreadCounts.reduce((a, b) => a + b, 0))
		),
		0,
		this.subscriptions
	);

	/** @ignore */
	private get currentRoute () : string {
		return this.routeChanges.value;
	}

	/** Activated route data combined with that of child. */
	public combinedRouteData (
		activatedRoute: ActivatedRoute
	) : Observable<[Data, Params, UrlSegment[]]> {
		return this.routeChanges.pipe(
			mergeMap(() =>
				combineLatest([
					activatedRoute.data,
					activatedRoute.firstChild ?
						activatedRoute.firstChild.data :
						of({}),
					activatedRoute.params,
					activatedRoute.firstChild ?
						activatedRoute.firstChild.params :
						of({}),
					activatedRoute.url,
					activatedRoute.firstChild ?
						activatedRoute.firstChild.url :
						of([])
				])
			),
			map(([data, childData, params, childParams, url, childURL]) : [
				Data,
				Params,
				UrlSegment[]
			] => [
				{...data, ...childData},
				{...params, ...childParams},
				[...url, ...childURL]
			])
		);
	}

	/** Contact form dialog. */
	public async contactFormDialog (to?: string) : Promise<void> {
		await this.dialogService.baseDialog(ContactComponent, async o => {
			if (to) {
				o.hideToDropdown = true;
				o.to = to;
			}

			if (!this.accountDatabaseService.currentUser.value) {
				return;
			}

			const [email, {name, realUsername}] = await Promise.all([
				this.accountDatabaseService
					.getItem('email', StringProto, SecurityModels.unprotected)
					.catch(() => ''),
				this.accountDatabaseService.currentUser.value.user.accountUserProfile.getValue()
			]);

			o.fromEmail = email;
			o.fromName = name ? `${name} (@${realUsername})` : realUsername;
		});
	}

	/** Current route path. */
	public get routePath () : string[] {
		const route =
			this.activatedRoute.snapshot.firstChild &&
			this.activatedRoute.snapshot.firstChild.firstChild &&
			this.activatedRoute.snapshot.firstChild.firstChild.url.length > 0 ?
				this.activatedRoute.snapshot.firstChild.firstChild.url :
				undefined;

		return route ? route.map(o => o.path) : [];
	}

	/** Sets custom header text. */
	public setHeader (
		header: string | {desktop?: string; mobile?: string} | User
	) : void {
		this.headerInternal.next(header);
	}

	/** Toggles account menu. */
	public toggleMenu (menuExpanded?: boolean) : void {
		this.menuExpandedInternal.next(
			typeof menuExpanded === 'boolean' ?
				menuExpanded :
				!this.menuExpandedInternal.value
		);
	}

	/** Toggles mobile account menu. */
	public toggleMobileMenu (menuOpen?: boolean) : void {
		if (typeof menuOpen !== 'boolean') {
			menuOpen = !this.mobileMenuOpenInternal.value;
		}

		if (menuOpen && this.envService.isWeb && !this.envService.isCordova) {
			history.pushState(undefined, '');
		}

		this.mobileMenuOpenInternal.next(menuOpen);
	}

	/** Triggers event to ends transition between components. */
	public async transitionEnd () : Promise<void> {
		await sleep(0);
		this.transitionInternal.next(false);
	}

	/** Runs on user login. */
	public async userInit () : Promise<void> {
		await this.accountDatabaseService.currentUserFiltered
			.pipe(take(1))
			.toPromise();

		(async () => {
			const fingerprintAuthSupported = await this.fingerprintService
				.supported;

			let windowBlurred: number | undefined;

			this.subscriptions.push(
				this.windowWatcherService.visibility
					.pipe(skip(1))
					.subscribe(async visible =>
						this.ngZone.run(async () => {
							if (!visible) {
								windowBlurred = await getTimestamp();
								return;
							}

							if (fingerprintAuthSupported) {
								document.body.classList.add('soft-lock');
							}

							const {url} = this.router;

							const chatReloadPromise =
								(url.startsWith('mail/') ||
									url.startsWith('messages/')) &&
								windowBlurred !== undefined &&
								(await getTimestamp()) - windowBlurred >
									this.chatBlurReloadTimeout ?
									this.router
										.navigate(['transition'], {
											skipLocationChange: true
										})
										.then(async () =>
											this.router.navigate(url.split('/'))
										) :
									Promise.resolve();

							if (!fingerprintAuthSupported) {
								await chatReloadPromise;
								return;
							}

							if (await this.fingerprintService.authenticate()) {
								await chatReloadPromise;
								document.body.classList.remove('soft-lock');
								return;
							}

							await this.accountAuthService.lock();
						})
					)
			);
		})();

		this.subscriptions.push(
			this.accountSettingsService.plan
				.pipe(map(plan => plan > CyphPlans.Free))
				.subscribe(this.envService.pro)
		);

		const incomingCalls = this.accountDatabaseService.getAsyncMap(
			'incomingCalls',
			NeverProto,
			SecurityModels.unprotected,
			undefined,
			undefined,
			undefined,
			this.subscriptions
		);

		const respondedCallRequests = new Set<string>();

		this.subscriptions.push(
			incomingCalls.watchKeys().subscribe(async keys => {
				const removing = [];

				for (const k of keys) {
					if (respondedCallRequests.has(k)) {
						continue;
					}

					try {
						const [callType, username, id, expiresString] = k.split(
							','
						);
						const expires = toInt(expiresString);
						const timestamp = await getTimestamp();

						if (
							(callType !== 'audio' && callType !== 'video') ||
							!username ||
							!id ||
							isNaN(expires) ||
							timestamp >= expires
						) {
							continue;
						}

						const user = await this.accountUserLookupService.getUser(
							username
						);
						if (!user) {
							continue;
						}

						const [
							contactID,
							{name, realUsername}
						] = await Promise.all([
							user.contactID,
							user.accountUserProfile.getValue()
						]);

						const incomingCallAnswer = getOrSetDefault(
							this.incomingCallAnswers,
							id,
							/* eslint-disable-next-line @typescript-eslint/tslint/config */
							() => resolvable<boolean>()
						);

						const dialogClose = resolvable<() => void>();

						/* Prevent brief ring after acceptance via notification action */
						if (this.envService.isCordovaMobile) {
							await this.pushNotificationsActive.promise;
							await sleep(1000);
						}

						const answered =
							typeof incomingCallAnswer.value === 'boolean' ?
								incomingCallAnswer.value :
								await this.notificationService.ring(
									Promise.race([
										incomingCallAnswer.promise,
										this.dialogService.confirm(
											{
												bottomSheet: true,
												cancel: this.stringsService
													.decline,
												cancelFAB: 'close',
												content: `${name} (@${realUsername})`,
												fabAvatar: user.avatar,
												ok: this.stringsService.answer,
												okFAB: 'phone',
												timeout: expires - timestamp,
												title:
													callType === 'audio' ?
														this.stringsService
															.incomingCallAudio :
														this.stringsService
															.incomingCallVideo
											},
											dialogClose
										)
									])
								);

						(await dialogClose.promise)();

						if (answered) {
							this.router.navigate([
								callType,
								contactID,
								id,
								expiresString
							]);
						}
					}
					catch {
					}
					finally {
						if (!respondedCallRequests.has(k)) {
							respondedCallRequests.add(k);
							removing.push(k);
						}
					}
				}

				try {
					await Promise.all(
						removing.map(async k => incomingCalls.removeItem(k))
					);
				}
				catch {}
			})
		);
	}

	constructor (
		/** @ignore */
		private readonly activatedRoute: ActivatedRoute,

		/** @ignore */
		private readonly ngZone: NgZone,

		/** @ignore */
		private readonly router: Router,

		/** @ignore */
		private readonly accountAppointmentsService: AccountAppointmentsService,

		/** @ignore */
		private readonly accountAuthService: AccountAuthService,

		/** @ignore */
		private readonly accountContactsService: AccountContactsService,

		/** @ignore */
		private readonly accountDatabaseService: AccountDatabaseService,

		/** @ignore */
		private readonly accountFilesService: AccountFilesService,

		/** @ignore */
		private readonly accountSettingsService: AccountSettingsService,

		/** @ignore */
		private readonly accountUserLookupService: AccountUserLookupService,

		/** @ignore */
		private readonly configService: ConfigService,

		/** @ignore */
		private readonly dialogService: DialogService,

		/** @ignore */
		private readonly envService: EnvService,

		/** @ignore */
		private readonly fingerprintService: FingerprintService,

		/** @ignore */
		private readonly notificationService: NotificationService,

		/** @ignore */
		private readonly potassiumService: PotassiumService,

		/** @ignore */
		private readonly stringsService: StringsService,

		/** @ignore */
		private readonly windowWatcherService: WindowWatcherService
	) {
		super();

		(<any> self).shareLogsWithCyph = async () => {
			await this.interstitial
				.pipe(
					filter(b => !b),
					take(1)
				)
				.toPromise();
			this.interstitial.next(true);

			await Promise.all([
				this.accountFilesService.upload(
					`${uuid()}.log`,
					{
						data: this.potassiumService.fromString(
							[
								(await envService.packageName) + '\n---',
								...(<Record<string, any>[]> (
									(<any> self).logs
								)).map(
									o =>
										`${o.timestamp}${
											o.error ? ' (error)' : ''
										}: ${
											o.argsCopy !== undefined ?
												prettyPrint(o.argsCopy) :
												stringify({
													keys: Object.keys(o.args)
												})
										}`
								)
							].join('\n\n\n\n') + '\n'
						),
						mediaType: 'text/plain',
						name: ''
					},
					'cyph'
				),
				sleep(1000)
			]);

			this.interstitial.next(false);
		};

		this.userInit();

		if (this.envService.isWeb && !this.envService.isCordova) {
			self.addEventListener('popstate', () => {
				this.mobileMenuOpenInternal.next(false);
			});
		}

		if (this.envService.isWeb && this.envService.isMobileOS) {
			new Hammer(document.body).on('panleft', () => {
				if (
					this.accountDatabaseService.currentUser.value ===
						undefined ||
					this.windowWatcherService.width.value >
						this.configService.responsiveMaxWidths.sm
				) {
					return;
				}

				if (!this.mobileMenuOpenInternal.value) {
					return;
				}

				this.mobileMenuOpenInternal.next(false);

				if (!this.envService.isCordova) {
					history.back();
				}
			});

			new Hammer(document.body, {
				recognizers: [
					[
						Hammer.Pan,
						{direction: Hammer.DIRECTION_RIGHT, threshold: 4}
					]
				]
			}).on('pan', e => {
				if (
					this.accountDatabaseService.currentUser.value ===
						undefined ||
					this.windowWatcherService.width.value >
						this.configService.responsiveMaxWidths.sm
				) {
					return;
				}

				if (e.center.x < 72 && e.deltaX > 8 && e.deltaY < 4) {
					this.toggleMobileMenu(true);
				}
			});
		}

		this.accountDatabaseService
			.pushNotificationsSubscribe(async data => {
				if (
					!data ||
					!data.additionalData ||
					data.additionalData.dismissed ||
					!(
						data.additionalData.notificationType in
						NotificationTypes
					) ||
					typeof data.additionalData.notificationID !== 'string'
				) {
					return;
				}

				switch (data.additionalData.notificationType) {
					case NotificationTypes.File:
						const {
							recordType
						} = await this.accountFilesService.getFile(
							data.additionalData.notificationID
						);

						this.router.navigate([
							this.accountFilesService.config[recordType].route
						]);
						break;

					case NotificationTypes.Message:
						this.router.navigate([
							'messages',
							data.additionalData.notificationID
						]);
				}
			})
			.then(() => {
				this.pushNotificationsActive.resolve();
			});

		for (const [callEvent, callAnswer] of <[string, boolean][]> [
			['callAccept', true],
			['callReject', false]
		]) {
			this.accountDatabaseService.pushNotificationsSubscribe(
				callEvent,
				async data => {
					if (
						!data ||
						!data.additionalData ||
						typeof data.additionalData.notificationID !== 'string'
					) {
						return;
					}

					getOrSetDefault(
						this.incomingCallAnswers,
						data.additionalData.notificationID,
						/* eslint-disable-next-line @typescript-eslint/tslint/config */
						() => resolvable<boolean>()
					).resolve(callAnswer);
				}
			);
		}

		this.header = combineLatest([
			this.activeSidebarContact,
			this.headerInternal,
			this.envService.isMobile,
			this.transitionInternal
		]).pipe(
			/* eslint-disable-next-line complexity */
			map(([activeSidebarContact, header, isMobile, _]) => {
				const routePath = this.routePath;
				const route = routePath[0];

				const specialCases: {[k: string]: string} = {
					ehr: 'EHR',
					inbox: 'Anonymous Inbox'
				};

				/* Avoid redundancy between header and sidebar */
				if (
					header instanceof User &&
					header.username === activeSidebarContact
				) {
					header = undefined;
				}

				/* Special case: set root header on mobile */
				if (!route && isMobile) {
					return this.envService.isTelehealthFull ?
						this.stringsService.profileHeader :
					this.envService.isTelehealth ?
						this.stringsService.productTelehealth :
						this.stringsService.messagesHeader;
				}

				/* No header */
				if (
					['register'].indexOf(route) > -1 ||
					([
						'account-burner',
						'appointments',
						'audio',
						'call',
						'video'
					].indexOf(route) > -1 &&
						routePath.length > 1 &&
						['end', 'forms'].indexOf(routePath[1]) > -1)
				) {
					return undefined;
				}

				/* No header until explicitly set via accountService.setHeader */
				if (
					['mail', 'messages', 'profile'].indexOf(route) > -1 &&
					routePath.length > 1 &&
					!(routePath[0] === 'profile' && routePath[1] === 'edit')
				) {
					/* Always make at least an empty string on mobile to ensure menu bar displays */
					return isMobile ? header || '' : header;
				}

				/*
					No header by default for non-whitelisted sections,
					or deep routes of non-whitelisted sections
				*/
				if (
					[
						'404',
						'appointments',
						'contacts',
						'docs',
						'doctors',
						'ehr-access',
						'files',
						'forms',
						'inbox',
						'incoming-patient-info',
						'notes',
						'passwords',
						'patients',
						'settings',
						'staff',
						'wallets',
						'welcome'
					].indexOf(route) < 0 ||
					([
						'appointments',
						'docs',
						'ehr-access',
						'files',
						'forms',
						'inbox',
						'incoming-patient-info',
						'notes',
						'passwords',
						'settings',
						'wallets'
					].indexOf(route) < 0 &&
						routePath.length > 1)
				) {
					/* Always make at least an empty string on mobile to ensure menu bar displays */
					return isMobile ? header || '' : undefined;
				}

				return (
					header ||
					translate(
						route
							.split('-')
							.map(
								s =>
									specialCases[s] ||
									s[0].toUpperCase() + s.slice(1)
							)
							.join(' ')
					)
				);
			}),
			map(header =>
				typeof header === 'string' ?
					{desktop: header, mobile: header} :
					header
			)
		);

		this.menuExpandable = combineLatest([
			this.menuReduced,
			this.windowWatcherService.width
		]).pipe(
			map(
				([menuReduced, width]) =>
					!menuReduced && width >= this.menuMinWidth
			)
		);

		this.menuExpanded = combineLatest([
			this.menuExpandedInternal,
			this.menuExpandable,
			this.mobileMenuOpen,
			this.windowWatcherService.width
		]).pipe(
			map(
				([
					menuExpandedInternal,
					menuExpandable,
					mobileMenuOpen,
					width
				]) =>
					mobileMenuOpen ||
					(menuExpandedInternal &&
						menuExpandable &&
						width > this.configService.responsiveMaxWidths.xs)
			)
		);

		this.menuMaxWidth = combineLatest([
			this.menuExpanded,
			this.windowWatcherService.width
		]).pipe(
			map(([menuExpanded, width]) =>
				width <= this.configService.responsiveMaxWidths.xs ?
					'100%' :
				!menuExpanded ?
					'6em' :
				this.menuMinWidth > width ?
					'100%' :
					this.menuExpandedMinWidthPX
			)
		);

		let lastSection = '';
		let lastURL = '';

		this.subscriptions.push(
			this.router.events.subscribe(e => {
				if (!(e instanceof NavigationEnd)) {
					return;
				}

				const urlSplit = e.urlAfterRedirects.split('/');
				const newURL = urlSplit.slice(0, 2).join('/');
				const section = (urlSplit[0] !== 'search' && urlSplit[0]) || '';

				if (newURL === 'transition') {
					return;
				}

				if (newURL !== lastURL) {
					lastURL = newURL;
					this.headerInternal.next(undefined);
				}

				if (section !== lastSection) {
					lastSection = section;
					this.transitionInternal.next(true);
				}
			})
		);

		this.uiReady.then(() => {
			this.isUiReady.next(true);
		});
	}
}
