import {ChangeDetectionStrategy, Component, Input, OnInit} from '@angular/core';
import {BehaviorSubject} from 'rxjs';
import {emailPattern} from '../../email-pattern';
import {ConfigService} from '../../services/config.service';
import {StringsService} from '../../services/strings.service';
import {trackBySelf} from '../../track-by/track-by-self';
import {email} from '../../util/email';


/**
 * Angular component for contact form UI.
 */
@Component({
	changeDetection: ChangeDetectionStrategy.OnPush,
	selector: 'cyph-contact',
	styleUrls: ['./contact.component.scss'],
	templateUrl: './contact.component.html'
})
export class ContactComponent implements OnInit {
	/** @see emailPattern */
	public readonly emailPattern			= emailPattern;

	/** Indicates whether the feedback form UI should be displayed. */
	public readonly feedbackForm			= new BehaviorSubject<boolean>(false);

	/** Sender email address. */
	@Input() public fromEmail: string		= '';

	/** Sender name. */
	@Input() public fromName: string		= '';

	/** Indicates whether data collection is consented to under the GDPR. */
	public readonly gdprConsent				= new BehaviorSubject<boolean>(false);

	/** Email body. */
	@Input() public message: string			= '';

	/** Indicates whether response is requested. */
	public readonly responseRequested		= new BehaviorSubject<boolean>(false);

	/** Indicates whether email has been sent. */
	public readonly sent					= new BehaviorSubject<boolean>(false);

	/** Email subject. */
	@Input() public subject: string			= '';

	/** Recipient @cyph.com email address ("@cyph.com" may be omitted). */
	@Input() public to: string				= 'hello';

	/** @see trackBySelf */
	public readonly trackBySelf				= trackBySelf;

	/** @inheritDoc */
	public ngOnInit () : void {
		this.feedbackForm.next(this.to === 'feedback');
	}

	/** Sends email. */
	public send () : void {
		email(
			this.to,
			this.subject,
			this.message,
			this.fromEmail,
			this.fromName
		);

		this.sent.next(true);
	}

	constructor (
		/** @see ConfigService */
		public readonly configService: ConfigService,

		/** @see StringsService */
		public readonly stringsService: StringsService
	) {}
}
